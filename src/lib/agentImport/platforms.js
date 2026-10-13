// One reader per platform. Each takes the already-parsed source (JSON object,
// YAML object, Python text or Markdown) and returns board agent drafts.

import { findPythonCalls, listNames, valueText } from './python.js';
import { addTools, draft, withModel } from './platformDraft.js';

export { fromElevenLabs } from './platformElevenLabs.js';

// ── Google ADK ───────────────────────────────────────────────────────

/** ADK Agent Config YAML (agent_class: LlmAgent, name, model, instruction, tools). */
export function fromAdkConfig(config) {
  const carried = ['Name', 'Instructions'];
  const notCarried = [];
  const model = withModel(config.model, 'google', carried, notCarried);
  const rawTools = (Array.isArray(config.tools) ? config.tools : []).map((tool) => {
    const name = typeof tool === 'string' ? tool : tool?.name || '';
    // A dotted name ("my_pkg.tools.lookup") is the user's own Python function.
    return { name: name.split('.').pop(), kind: name.includes('.') ? 'function' : null };
  });
  const tools = addTools(rawTools, carried, notCarried);
  for (const sub of Array.isArray(config.sub_agents) ? config.sub_agents : []) {
    const label = sub?.config_path || sub?.name || sub?.code || 'sub-agent';
    notCarried.push({ name: `Sub-agent ${label}`, why: 'Import its own file to bring it in as a separate agent.' });
  }
  if (config.agent_class && !/llmagent|^agent$/i.test(String(config.agent_class))) {
    notCarried.push({ name: `Agent type ${config.agent_class}`, why: 'Workflow agents (sequential, parallel, loop) come in as one chat agent.' });
  }
  if (config.generate_content_config) notCarried.push({ name: 'Generation settings', why: 'Temperature and similar settings use the board defaults.' });
  if (config.description) carried.push('Description');
  return [draft('google-adk', {
    name: config.name,
    description: config.description,
    instructions: config.instruction || config.global_instruction,
    provider: model.provider,
    model: model.model,
    tools,
    carried,
    notCarried,
  })];
}

/** ADK agents written in Python: Agent(...) / LlmAgent(...) calls. */
export function fromAdkPython(src) {
  const calls = findPythonCalls(src, ['LlmAgent', 'Agent', 'SequentialAgent', 'ParallelAgent', 'LoopAgent']);
  const functions = new Set([...src.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)].map(m => m[1]));
  const ordered = [...calls].sort((a, b) => (b.variable === 'root_agent') - (a.variable === 'root_agent'));
  return ordered.map((call) => {
    const kw = call.args.keywords;
    const carried = ['Name', 'Instructions'];
    const notCarried = [];
    const modelValue = kw.model?.kind === 'call'
      ? valueText(kw.model.args.keywords.model || kw.model.args.positional[0])
      : valueText(kw.model);
    const model = withModel(modelValue, 'google', carried, notCarried);
    const rawTools = listNames(kw.tools).map(name => ({
      name,
      kind: functions.has(name) ? 'function' : (/mcp/i.test(name) ? 'mcp' : null),
    }));
    const tools = addTools(rawTools, carried, notCarried);
    for (const sub of listNames(kw.sub_agents)) {
      notCarried.push({ name: `Sub-agent ${sub}`, why: 'Comes in as its own agent from this same file.' });
    }
    if (call.className !== 'Agent' && call.className !== 'LlmAgent') {
      notCarried.push({ name: `Agent type ${call.className}`, why: 'Workflow agents (sequential, parallel, loop) come in as one chat agent.' });
    }
    if (kw.output_key) notCarried.push({ name: 'output_key', why: 'ADK session state has no board equivalent.' });
    if (kw.description) carried.push('Description');
    return draft('google-adk', {
      name: valueText(kw.name) || call.variable,
      description: valueText(kw.description),
      instructions: valueText(kw.instruction) || valueText(kw.global_instruction),
      provider: model.provider,
      model: model.model,
      tools,
      carried,
      notCarried,
    });
  });
}

// ── OpenAI (and Grok, which speaks the same API) ─────────────────────

function openAiToolEntries(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    if (typeof tool === 'string') return { name: tool };
    if (tool?.type === 'function') return { name: tool.function?.name || tool.name || 'function', kind: 'function' };
    if (tool?.type === 'mcp') return { name: tool.server_label || 'mcp', kind: 'mcp' };
    return { name: tool?.type || tool?.name || 'tool' };
  });
}

function systemFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  return messages
    .filter(m => m?.role === 'system' || m?.role === 'developer')
    .map(m => (typeof m.content === 'string' ? m.content : (m.content || []).map(p => p?.text || '').join('')))
    .join('\n\n');
}

/** OpenAI assistant object, Responses-style agent JSON, or a Grok config. */
export function fromOpenAiJson(obj, platform = 'openai') {
  const carried = ['Name', 'Instructions'];
  const notCarried = [];
  const fallback = platform === 'grok' ? 'xai' : 'openai';
  const model = withModel(obj.model, fallback, carried, notCarried);
  const tools = addTools(openAiToolEntries(obj.tools), carried, notCarried);
  if (obj.tool_resources && Object.keys(obj.tool_resources).length) {
    notCarried.push({ name: 'Attached files', why: 'Files and vector stores stay on the original platform.' });
  }
  if (obj.temperature != null || obj.top_p != null) notCarried.push({ name: 'Temperature', why: 'Board agents use their provider\'s default.' });
  if (obj.response_format && obj.response_format !== 'auto') notCarried.push({ name: 'Response format', why: 'Board agents answer in chat text.' });
  if (Array.isArray(obj.handoffs) && obj.handoffs.length) notCarried.push({ name: 'Handoffs', why: 'Import each agent; they can ask each other for help on the board.' });
  if (obj.description) carried.push('Description');
  return [draft(platform, {
    name: obj.name,
    description: obj.description,
    instructions: obj.instructions || obj.system_prompt || obj.system || systemFromMessages(obj.messages),
    provider: model.provider,
    model: model.model,
    tools,
    carried,
    notCarried,
  })];
}

/** OpenAI Agents SDK in Python: Agent(name=..., instructions=..., tools=[...]). */
export function fromOpenAiPython(src) {
  const calls = findPythonCalls(src, ['Agent']);
  const functions = new Set([...src.matchAll(/@function_tool[\s\S]*?def\s+([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]));
  return calls.map((call) => {
    const kw = call.args.keywords;
    const carried = ['Name', 'Instructions'];
    const notCarried = [];
    const model = withModel(valueText(kw.model), 'openai', carried, notCarried);
    const rawTools = listNames(kw.tools).map(name => ({
      name,
      kind: functions.has(name) ? 'function' : null,
    }));
    const tools = addTools(rawTools, carried, notCarried);
    if (kw.handoffs) notCarried.push({ name: 'Handoffs', why: 'Import each agent; they can ask each other for help on the board.' });
    if (kw.output_type) notCarried.push({ name: 'Output type', why: 'Board agents answer in chat text.' });
    if (kw.guardrails || kw.input_guardrails || kw.output_guardrails) notCarried.push({ name: 'Guardrails', why: 'The board\'s own safety checks apply instead.' });
    return draft('openai', {
      name: valueText(kw.name) || call.variable,
      description: valueText(kw.handoff_description),
      instructions: valueText(kw.instructions),
      provider: model.provider,
      model: model.model,
      tools,
      carried,
      notCarried,
    });
  });
}

// ── Claude ───────────────────────────────────────────────────────────

function claudeToolList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function claudeDraft({ name, description, prompt, tools, model, extras = [] }) {
  const carried = ['Name', 'Instructions'];
  const notCarried = [...extras];
  const resolved = withModel(model, 'anthropic', carried, notCarried);
  const boardTools = addTools(claudeToolList(tools).map(t => ({ name: t, kind: /^mcp__/.test(t) ? 'mcp' : null })), carried, notCarried);
  if (description) carried.push('Description');
  return draft('claude', {
    name,
    description,
    instructions: prompt,
    provider: resolved.provider,
    model: resolved.model,
    tools: boardTools,
    carried,
    notCarried,
  });
}

/** Claude Code subagent: Markdown with name/description/tools/model frontmatter. */
export function fromClaudeMarkdown(frontmatter, body) {
  return [claudeDraft({
    name: frontmatter.name,
    description: frontmatter.description,
    prompt: body,
    tools: frontmatter.tools,
    model: frontmatter.model,
  })];
}

/** Claude Agent SDK shapes: { agents: {...} }, an AgentDefinition, or query options. */
export function fromClaudeJson(obj) {
  if (obj.agents && typeof obj.agents === 'object' && !Array.isArray(obj.agents)) {
    return Object.entries(obj.agents).map(([key, def]) => claudeDraft({
      name: def?.name || key,
      description: def?.description,
      prompt: def?.prompt,
      tools: def?.tools,
      model: def?.model || obj.model,
    }));
  }
  const prompt = obj.prompt || (typeof obj.systemPrompt === 'string' ? obj.systemPrompt : obj.systemPrompt?.append) || obj.system;
  const extras = [];
  if (obj.mcpServers && Object.keys(obj.mcpServers).length) {
    extras.push({ name: 'MCP servers', why: 'Connect those servers on the board first, then add their tools.' });
  }
  if (obj.permissionMode) extras.push({ name: 'Permission mode', why: 'The board asks you before risky steps instead.' });
  return [claudeDraft({
    name: obj.name,
    description: obj.description,
    prompt,
    tools: obj.tools || obj.allowedTools,
    model: obj.model,
    extras,
  })];
}
