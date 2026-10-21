// ═══════════════════════════════════════════════════════════════════
//  NATIVE ANTHROPIC (CLAUDE) CHAT
//  The rest of the gateway speaks OpenAI chat-completion shapes. This file
//  translates one of those requests into a Messages API call through the
//  official SDK, streams text back through `onDelta`, and returns the same
//  chat.completion shape every other provider returns, so the chat loop,
//  tools, usage records and the agent network need no Claude-specific code.
//
//    system messages     → top-level `system` blocks, cached (board context)
//    image_url parts     → image blocks (base64 or URL)
//    file (PDF) parts    → document blocks
//    assistant tool_calls→ tool_use blocks
//    role 'tool' results → tool_result blocks in one user turn
//    tools (functions)   → { name, description, input_schema }
//
//  The raw Claude content (thinking blocks included) rides back on the
//  assistant message as `anthropic_content`, so the next tool round can hand
//  it back unchanged, which Claude needs to keep reasoning across tool calls.
// ═══════════════════════════════════════════════════════════════════
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logger.js';
import { buildChatUsageRecord, recordChatUsage } from './usage.js';
import { chatCompletionHttpError } from './retryPolicy.js';
import { toAnthropicRequest } from './anthropicRequest.js';
import { missingKeyError } from './missingKey.js';

export {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  anthropicModelFor,
  toAnthropicPart,
  toAnthropicRequest,
} from './anthropicRequest.js';

export const ANTHROPIC_PROVIDER = 'anthropic';
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
// Models that take the server-side refusal fallback (`fallbacks: "default"`):
// when a safety check declines, the API reruns the turn on a suitable model
// instead of returning an empty reply.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const anthropicChatLog = createLogger('ai');

export function isAnthropicProvider(config) {
  const provider = String(config?.provider || '').toLowerCase();
  return provider === ANTHROPIC_PROVIDER || provider === 'claude';
}

const FINISH_REASONS = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  pause_turn: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
  refusal: 'content_filter',
};

function toOpenAiUsage(usage) {
  if (!usage) return undefined;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const prompt = (usage.input_tokens || 0) + cacheRead + cacheWrite;
  const completion = usage.output_tokens || 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: cacheRead, cache_write_tokens: cacheWrite },
  };
}

/** Messages API response → chat.completion. Pure; exported for tests. */
export function toOpenAiChatCompletion(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  const thinking = blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking || '').join('');
  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  const refused = message?.stop_reason === 'refusal';
  const out = {
    role: 'assistant',
    content: text || (refused ? 'Claude declined to answer this request.' : ''),
    anthropic_content: blocks,
  };
  if (thinking) out.reasoning_content = thinking;
  if (toolCalls.length) out.tool_calls = toolCalls;
  return {
    id: message?.id || `anthropic-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: message?.model || null,
    choices: [{
      index: 0,
      message: out,
      finish_reason: FINISH_REASONS[message?.stop_reason] || (toolCalls.length ? 'tool_calls' : 'stop'),
    }],
    ...(message?.usage ? { usage: toOpenAiUsage(message.usage) } : {}),
  };
}

function toGatewayError(err) {
  if (err instanceof Anthropic.APIError && Number.isFinite(err.status)) {
    const retryAfter = typeof err.headers?.get === 'function' ? err.headers.get('retry-after') : err.headers?.['retry-after'] || null;
    return chatCompletionHttpError(err.status, err.message, retryAfter, ANTHROPIC_PROVIDER);
  }
  return err;
}

/**
 * Run one chat round against Claude. Streams (so long replies never hit an
 * HTTP timeout) and forwards text to `onDelta` when given.
 */
export async function requestAnthropicChatCompletion({
  config = {},
  body = {},
  timeoutMs,
  logContext = {},
  usageAttribution = null,
  usageSink = null,
  onDelta = null,
} = {}) {
  if (!config?.apiKey) {
    throw missingKeyError('anthropic');
  }
  const payload = config?.model && !body?.model ? { ...body, model: config.model } : body;
  const params = toAnthropicRequest(payload);
  const baseUrl = config.baseUrl || ANTHROPIC_DEFAULT_BASE_URL;
  const context = logContext && typeof logContext === 'object' ? logContext : {};
  const done = anthropicChatLog.startTimer();

  anthropicChatLog.debug('anthropic chat request', {
    ...context,
    provider: ANTHROPIC_PROVIDER,
    model: params.model,
    messages: params.messages.length,
    tools: params.tools?.length || 0,
  });

  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: baseUrl,
    maxRetries: 2,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });

  try {
    const stream = FALLBACK_MODELS.has(params.model)
      ? client.beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' })
      : client.messages.stream(params);
    if (typeof onDelta === 'function') stream.on('text', (delta) => { if (delta) onDelta(delta); });
    const message = await stream.finalMessage();
    const data = toOpenAiChatCompletion(message);
    record({ ok: true, baseUrl, payload: { ...payload, model: params.model }, data, ms: done(), context, usageAttribution, usageSink });
    return data;
  } catch (err) {
    const error = toGatewayError(err);
    record({ ok: false, baseUrl, payload: { ...payload, model: params.model }, error, ms: done(), context, usageAttribution, usageSink });
    throw error;
  }
}

function record({ ok, baseUrl, payload, data = null, error = null, ms, context, usageAttribution, usageSink }) {
  const entry = buildChatUsageRecord({
    ok,
    config: { provider: ANTHROPIC_PROVIDER, model: payload.model, baseUrl },
    baseUrl,
    payload,
    data,
    error,
    ms,
    attempts: 1,
    context,
  });
  recordChatUsage(anthropicChatLog, entry);
  void usageSink?.({ record: entry, attribution: usageAttribution || {} });
}
