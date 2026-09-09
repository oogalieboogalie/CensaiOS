import {
  aiGatewayLog,
  CHAT_COMPLETION_TIMEOUT_MS,
  DEFAULT_CHAT_BASE_URL,
  DEFAULT_CHAT_MODEL,
  OLLAMA_CHAT_MODEL_ALIASES,
  callModel,
  getDefaultChatApiKey,
} from '../../aiGateway/index.js';

export const log = aiGatewayLog;

export const BASE_URL = DEFAULT_CHAT_BASE_URL;
export const getApiKey = getDefaultChatApiKey;
export const MODEL = DEFAULT_CHAT_MODEL;
export const TASK_WORKER_TIMEOUT_MS = CHAT_COMPLETION_TIMEOUT_MS;
export const MAX_CHAT_MODEL_ROUNDS = 10;
export const FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS = Math.min(
  MAX_CHAT_MODEL_ROUNDS - 1,
  Math.max(2, Number(process.env.AGENT_FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS) || 6)
);
export const DIRECT_SYNTHESIS_TOOLS = new Set([
  'project_write',
  'project_edit',
  'project_multi_edit',
  'local_write_file',
  'github_write_file',
  'report',
  'task_done',
]);
export const OLLAMA_MODEL_ALIASES = OLLAMA_CHAT_MODEL_ALIASES;

export async function fetchChatCompletion(baseUrl, apiKey, body, timeoutMs = TASK_WORKER_TIMEOUT_MS) {
  return callModel({
    config: {
      provider: null,
      model: body?.model,
      baseUrl,
      apiKey,
    },
    body,
    timeoutMs,
    logContext: {
      source: 'legacy-fetchChatCompletion',
    },
  });
}

export function extractMessageText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

export function publicToolActions(toolActions) {
  if (!toolActions.length) return undefined;
  return toolActions.map(action => ({
    tool: action.tool,
    ms: action.ms,
    round: action.round,
    result_chars: action.result_chars,
    ...(typeof action.ok === 'boolean' ? { ok: action.ok } : {}),
    ...(action.summary ? { summary: action.summary } : {}),
  }));
}

export function publicTimings(timings) {
  return {
    ...timings,
    tool_calls: (timings.tool_calls || []).map(action => ({
      tool: action.tool,
      ms: action.ms,
      round: action.round,
      result_chars: action.result_chars,
      ...(typeof action.ok === 'boolean' ? { ok: action.ok } : {}),
    })),
  };
}
