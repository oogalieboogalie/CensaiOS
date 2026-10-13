// Import agent: read an agent exported from another platform (Google ADK,
// OpenAI, Claude, Grok, ElevenLabs) and turn it into board agent drafts.
// Pure: the caller decides whether to save. Nothing here runs the file.

import * as yaml from 'js-yaml';
import { PLATFORMS, PROVIDER_LABELS } from './mapping.js';
import {
  fromAdkConfig,
  fromAdkPython,
  fromClaudeJson,
  fromClaudeMarkdown,
  fromElevenLabs,
  fromOpenAiJson,
  fromOpenAiPython,
} from './platforms.js';

export { PLATFORMS, PROVIDER_LABELS } from './mapping.js';

export const MAX_IMPORT_BYTES = 512 * 1024;

export class AgentImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AgentImportError';
  }
}

function tryJson(text) {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return undefined;
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

function splitFrontmatter(text) {
  const match = /^\uFEFF?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$/.exec(text);
  if (!match) return null;
  let data = {};
  try { data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) || {}; } catch { return null; }
  return typeof data === 'object' ? { data, body: match[2] } : null;
}

function isElevenLabs(obj) {
  return Boolean(obj?.conversation_config || (obj?.agent_id && obj?.platform_settings));
}

function isClaudeJson(obj) {
  return Boolean(
    (obj?.agents && typeof obj.agents === 'object' && !Array.isArray(obj.agents))
    || obj?.prompt
    || obj?.systemPrompt
    || obj?.allowedTools
    || /^(claude|sonnet|opus|haiku)/i.test(String(obj?.model || ''))
    || /^anthropic\//i.test(String(obj?.model || '')),
  );
}

function isGrok(obj) {
  return /grok/i.test(String(obj?.model || '')) || /^x-?ai$/i.test(String(obj?.provider || ''));
}

function isAdkConfig(obj) {
  return Boolean(obj?.agent_class || (obj?.instruction && obj?.name));
}

function fromJsonObject(obj, hint) {
  if (Array.isArray(obj)) return obj.flatMap(item => fromJsonObject(item, hint));
  if (!obj || typeof obj !== 'object') return [];
  // List responses from platform APIs: { data: [...] } (OpenAI) / { agents: [...] } (ElevenLabs).
  if (Array.isArray(obj.data)) return obj.data.flatMap(item => fromJsonObject(item, hint));
  if (Array.isArray(obj.agents)) return obj.agents.flatMap(item => fromJsonObject(item, hint));
  if (hint === 'elevenlabs' || isElevenLabs(obj)) return fromElevenLabs(obj);
  if (hint === 'google-adk' || (!hint && isAdkConfig(obj))) return fromAdkConfig(obj);
  if (hint === 'grok' || (!hint && isGrok(obj))) return fromOpenAiJson(obj, 'grok');
  if (hint === 'claude' || (!hint && isClaudeJson(obj))) return fromClaudeJson(obj);
  return fromOpenAiJson(obj, 'openai');
}

function looksPython(text) {
  return /^\s*(from|import)\s+[\w.]+/m.test(text) || /\b(Llm)?Agent\s*\(/.test(text);
}

/**
 * Detect the platform and read every agent in one exported file.
 * @param {string} text  file contents
 * @param {{platform?:string, fileName?:string}} [opts] platform hint from the picker
 * @returns {{platform:string, agents:Array<object>}}
 */
export function parseAgentFile(text, { platform = null, fileName = '' } = {}) {
  const src = String(text ?? '');
  if (!src.trim()) throw new AgentImportError('Paste an agent file or choose one first.');
  if (src.length > MAX_IMPORT_BYTES) throw new AgentImportError('That file is too big to be an agent definition (over 512 KB).');
  const hint = platform && PLATFORMS[platform] ? platform : null;
  const ext = String(fileName).toLowerCase().split('.').pop();

  let agents = [];
  const json = tryJson(src);
  if (json !== undefined) {
    agents = fromJsonObject(json, hint);
  } else if (ext === 'md' || splitFrontmatter(src)) {
    const fm = splitFrontmatter(src);
    if (!fm) throw new AgentImportError('That Markdown file has no agent header (the --- block with name and description).');
    agents = fromClaudeMarkdown(fm.data, fm.body);
  } else if (ext === 'py' || looksPython(src)) {
    const isOpenAi = hint === 'openai' || (!hint && /from\s+agents\s+import|import\s+agents\b/.test(src));
    agents = isOpenAi ? fromOpenAiPython(src) : fromAdkPython(src);
  } else {
    let data;
    try { data = yaml.load(src, { schema: yaml.JSON_SCHEMA }); } catch (err) {
      throw new AgentImportError(`Could not read that file: ${String(err?.reason || err?.message || err).slice(0, 120)}`);
    }
    if (!data || typeof data !== 'object') throw new AgentImportError('That does not look like an agent definition.');
    agents = fromJsonObject(data, hint || (isAdkConfig(data) ? 'google-adk' : null));
  }

  agents = agents.filter(agent => agent.instructions || agent.name !== 'Imported agent');
  if (!agents.length) throw new AgentImportError('No agent found in that file. It needs at least a name or instructions.');
  return { platform: agents[0].platform, agents: agents.map(decorate) };
}

function decorate(agent) {
  return {
    ...agent,
    platformLabel: PLATFORMS[agent.platform]?.label || agent.platform,
    providerLabel: PROVIDER_LABELS[agent.provider] || agent.provider,
  };
}

/** Which vault key an imported agent needs to talk (and to speak, for ElevenLabs voices). */
export function keysNeeded(agent) {
  const out = [];
  if (agent?.provider && agent.provider !== 'ollama') out.push(agent.provider);
  if (agent?.voice?.provider === 'elevenlabs') out.push('elevenlabs');
  if (agent?.tools?.includes('make_video') && !out.includes('google')) out.push('google');
  return out;
}

/**
 * The payload POST /api/agents expects for an imported draft.
 * @param {object} agent  one entry of parseAgentFile().agents
 * @param {{id:string, hue?:number}} opts
 */
export function toAgentPayload(agent, { id, hue = 222 } = {}) {
  const tools = [...new Set(['report', ...(agent.tools || [])])];
  return {
    id,
    name: agent.name,
    role: agent.description ? agent.description.slice(0, 120) : `Imported from ${agent.platformLabel || agent.platform}`,
    glyph: (agent.name.trim()[0] || '?').toUpperCase(),
    hue,
    kind: 'ai',
    personality: agent.description || null,
    specialty: `Imported from ${agent.platformLabel || agent.platform}`,
    system_prompt: agent.instructions || null,
    model_provider: agent.provider,
    model_name: agent.model,
    toolScopes: {
      mode: 'custom',
      tools,
      scopes: { github: { repos: [] }, local: { paths: [] }, project: { mode: 'current' } },
      ...(agent.voice ? { voice: agent.voice } : {}),
      imported: {
        platform: agent.platform,
        carried: agent.carried,
        notCarried: agent.notCarried.map(item => `${item.name}: ${item.why}`),
        at: new Date().toISOString(),
      },
    },
  };
}
