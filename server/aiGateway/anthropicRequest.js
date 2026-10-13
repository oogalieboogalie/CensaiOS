// Request side of the native Anthropic provider: OpenAI-shaped chat payloads
// → Messages API params. Pure; anthropicChat.js does the call.

import { parseDataUrl } from './multimodal.js';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16000;
const TOOL_ID_PATTERN = /[^a-zA-Z0-9_-]/g;

/** Saved agents may carry another provider's model name; only claude-* ids reach Claude. */
export function anthropicModelFor(model) {
  const value = String(model || '').trim();
  return /^claude-/i.test(value) ? value : ANTHROPIC_DEFAULT_MODEL;
}

function toolId(id, fallback) {
  const clean = String(id || '').replace(TOOL_ID_PATTERN, '_');
  return clean || fallback;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content
    .map((part) => (typeof part === 'string' ? part : part?.type === 'text' || typeof part?.text === 'string' ? part.text || '' : ''))
    .filter(Boolean)
    .join('\n');
}

function textBlock(text) {
  const value = String(text || '');
  return value.trim() ? { type: 'text', text: value } : null;
}

function parseArguments(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed };
  } catch {
    return { raw: String(raw || '') };
  }
}

/** One OpenAI-format user content part → a Claude content block (or null). */
export function toAnthropicPart(part) {
  if (typeof part === 'string') return textBlock(part);
  if (!part || typeof part !== 'object') return null;
  if (part.type === 'text') return textBlock(part.text);
  if (part.type === 'image_url') {
    const url = part.image_url?.url || part.image_url;
    const parsed = parseDataUrl(url);
    if (parsed) return { type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 } };
    if (/^https?:\/\//i.test(String(url || ''))) return { type: 'image', source: { type: 'url', url } };
    return null;
  }
  if (part.type === 'file') {
    const parsed = parseDataUrl(part.file?.file_data);
    if (!parsed) return null;
    return {
      type: 'document',
      source: { type: 'base64', media_type: parsed.mime === 'application/pdf' ? 'application/pdf' : parsed.mime, data: parsed.base64 },
      ...(part.file?.filename ? { title: String(part.file.filename).slice(0, 200) } : {}),
    };
  }
  // Claude has no audio or video input; the capability map hides those
  // controls, so this only covers old history.
  if (part.type === 'input_audio') return textBlock('[audio attachment omitted: Claude cannot listen to audio]');
  if (part.type === 'video_url') return textBlock('[video attachment omitted: Claude cannot watch video]');
  return typeof part.text === 'string' ? textBlock(part.text) : null;
}

function userBlocks(content) {
  if (Array.isArray(content)) return content.map(toAnthropicPart).filter(Boolean);
  const block = textBlock(textOf(content));
  return block ? [block] : [];
}

function assistantBlocks(message) {
  if (Array.isArray(message.anthropic_content) && message.anthropic_content.length) {
    return message.anthropic_content.map((block) => ({ ...block }));
  }
  const blocks = [];
  const text = textBlock(textOf(message.content));
  if (text) blocks.push(text);
  (Array.isArray(message.tool_calls) ? message.tool_calls : []).forEach((call, index) => {
    if (!call?.function?.name) return;
    blocks.push({
      type: 'tool_use',
      id: toolId(call.id, `toolu_${index}`),
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    });
  });
  return blocks;
}

function toolResultBlock(message) {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '');
  return {
    type: 'tool_result',
    tool_use_id: toolId(message.tool_call_id, ''),
    content: content.trim() ? content : '(no output)',
  };
}

function toolUseAsText(block) {
  return { type: 'text', text: `[called ${block.name} with ${JSON.stringify(block.input ?? {})}]` };
}

function toolResultAsText(block) {
  return { type: 'text', text: `[tool result]\n${textOf(block.content)}` };
}

/**
 * Claude pairs every tool_use with a tool_result in the very next user turn.
 * History that breaks the pairing (trimmed context, a no-tools synthesis
 * round) is folded into plain text instead of failing the request.
 */
function repairToolPairs(messages, toolsEnabled) {
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === 'assistant') {
      const next = messages[i + 1];
      const answered = new Set(
        next?.role === 'user'
          ? next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id)
          : []
      );
      const keep = toolsEnabled;
      message.content = message.content
        .filter((block) => keep || (block.type !== 'thinking' && block.type !== 'redacted_thinking'))
        .map((block) => (block.type === 'tool_use' && (!keep || !answered.has(block.id)) ? toolUseAsText(block) : block));
    } else {
      const prev = messages[i - 1];
      const asked = new Set(
        prev?.role === 'assistant'
          ? prev.content.filter((b) => b.type === 'tool_use').map((b) => b.id)
          : []
      );
      message.content = message.content.map((block) => (
        block.type === 'tool_result' && (!toolsEnabled || !asked.has(block.tool_use_id)) ? toolResultAsText(block) : block
      ));
      // tool_result blocks must lead the user turn.
      message.content.sort((a, b) => Number(b.type === 'tool_result') - Number(a.type === 'tool_result'));
    }
  }
  return messages.filter((message) => message.content.length > 0);
}

function pushTurn(turns, role, blocks) {
  if (!blocks.length) return;
  const last = turns[turns.length - 1];
  if (last && last.role === role) last.content.push(...blocks);
  else turns.push({ role, content: [...blocks] });
}

function toAnthropicTool(tool) {
  const fn = tool?.type === 'function' ? tool.function : tool?.function || tool;
  if (!fn?.name) return null;
  const schema = fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : {};
  return {
    name: String(fn.name).replace(TOOL_ID_PATTERN, '_').slice(0, 128),
    ...(fn.description ? { description: String(fn.description) } : {}),
    input_schema: { type: 'object', properties: {}, ...schema },
  };
}

function toAnthropicToolChoice(choice) {
  if (choice === 'none') return { type: 'none' };
  // Forced tool choice is rejected by current Claude models; `auto` is the
  // closest supported behavior.
  if (choice === 'auto' || choice === 'required' || (choice && typeof choice === 'object')) return { type: 'auto' };
  return null;
}

/** OpenAI chat payload → Messages API params. Pure; exported for tests. */
export function toAnthropicRequest(payload = {}) {
  const system = [];
  const turns = [];
  let seenConversation = false;

  for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
    if (!message) continue;
    if (message.role === 'system' || message.role === 'developer') {
      const block = textBlock(textOf(message.content));
      if (!block) continue;
      // Leading system messages are the stable prefix (instructions, board
      // context). Later ones become a note in the conversation so the cached
      // prefix stays the same.
      if (!seenConversation) system.push(block);
      else pushTurn(turns, 'user', [{ type: 'text', text: `[System note]\n${block.text}` }]);
      continue;
    }
    seenConversation = true;
    if (message.role === 'assistant' || message.role === 'model') pushTurn(turns, 'assistant', assistantBlocks(message));
    else if (message.role === 'tool') pushTurn(turns, 'user', [toolResultBlock(message)]);
    else pushTurn(turns, 'user', userBlocks(message.content));
  }

  const tools = (Array.isArray(payload.tools) ? payload.tools : []).map(toAnthropicTool).filter(Boolean);
  const messages = repairToolPairs(turns, tools.length > 0);
  if (!messages.length || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: [{ type: 'text', text: '(continuing the conversation)' }] });
  }

  // Prompt caching: one breakpoint after the system prompt (tools and board
  // context, the big stable part) plus automatic caching of the conversation.
  if (system.length) system[system.length - 1] = { ...system[system.length - 1], cache_control: { type: 'ephemeral' } };

  const maxTokens = Number(payload.max_tokens ?? payload.max_completion_tokens);
  const stop = Array.isArray(payload.stop) ? payload.stop : payload.stop ? [payload.stop] : [];
  const toolChoice = tools.length ? toAnthropicToolChoice(payload.tool_choice) : null;

  return {
    model: anthropicModelFor(payload.model),
    // Thinking shares the output budget, so small OpenAI-style caps (the chat
    // loop asks for 4096) are raised to leave room for the answer.
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.max(maxTokens, ANTHROPIC_DEFAULT_MAX_TOKENS) : ANTHROPIC_DEFAULT_MAX_TOKENS,
    cache_control: { type: 'ephemeral' },
    ...(system.length ? { system } : {}),
    messages,
    ...(tools.length ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(stop.length ? { stop_sequences: stop.map(String).slice(0, 8) } : {}),
  };
}
