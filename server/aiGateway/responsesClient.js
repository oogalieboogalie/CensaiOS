import { createLogger } from '../logger.js';
import { normalizeBaseUrl } from './providers.js';
import {
  baseDelayForStatus,
  chatCompletionHttpError,
  isRetryableNetworkError,
  maxRetriesForStatus,
  nextRetryDelayMs,
  normalizeRetryOptions,
} from './retryPolicy.js';
import { buildChatUsageRecord, recordChatUsage } from './usage.js';
import { CHAT_COMPLETION_TIMEOUT_MS, aiGatewayLog } from './chatCompletion.js';

// Zen serves some models (e.g. muse-spark contributor-free) on the
// Responses endpoint instead of the chat completions path. This client speaks
// Responses and normalizes back to chat-completion shape so the tool
// loop downstream never knows the difference.
const RESPONSES_MODELS = new Set([
  'muse-spark-1.3-contributor-free',
  'muse-spark-1.3',
  'muse-spark-1.2',
]);

export function isResponsesModel(provider, model) {
  return provider === 'opencode' && RESPONSES_MODELS.has(model);
}

// Reasoning effort: minimal | low | medium | high | xhigh.
// 'default' or unset = provider default. Thinking time is agency —
// callers (or agents) choose, the gateway never caps it silently.
const REASONING_EFFORT_ALIASES = {
  'extra high': 'xhigh',
  'extra-high': 'xhigh',
  default: null,
  '': null,
};

export function normalizeReasoningEffort(value) {
  if (value === undefined || value === null) return undefined;
  const key = String(value).trim().toLowerCase();
  if (key in REASONING_EFFORT_ALIASES) return REASONING_EFFORT_ALIASES[key] || undefined;
  if (['minimal', 'low', 'medium', 'high', 'xhigh'].includes(key)) return key;
  return undefined;
}

export function chatMessagesToResponsesInput(messages) {
  const input = [];
  for (const m of messages || []) {
    if (m?.role === 'tool') {
      const outputs = Array.isArray(m.tool_calls) ? m.tool_calls : [{ id: m.tool_call_id, text: m.content }];
      for (const o of outputs) {
        input.push({
          type: 'function_call_output',
          call_id: o.id || m.tool_call_id,
          output: typeof o.text === 'string' ? o.text : JSON.stringify(o.text ?? m.content ?? ''),
        });
      }
      continue;
    }
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const tc of m.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function?.name,
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
        });
      }
      continue;
    }
    input.push({
      role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    });
  }
  return input;
}

export function chatToolsToResponsesTools(tools) {
  return (tools || [])
    .filter((t) => t?.type === 'function' && t.function?.name)
    .map((t) => ({
      type: 'function',
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || { type: 'object', properties: {} },
    }));
}

export function normalizeResponsesResponse(data, model) {
  const items = Array.isArray(data?.output) ? data.output : [];
  const texts = [];
  const toolCalls = [];
  for (const item of items) {
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        if (part?.type === 'output_text' && part.text) texts.push(part.text);
      }
    } else if (item?.type === 'function_call' && item.name) {
      toolCalls.push({
        id: item.call_id || item.id,
        type: 'function',
        function: {
          name: item.name,
          arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }
  const usage = data?.usage || {};
  return {
    id: data?.id || null,
    object: 'chat.completion',
    model: data?.model || model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: texts.join('') || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    }],
    usage: {
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    },
  };
}

export async function requestResponsesCompletion({
  config,
  body,
  timeoutMs = CHAT_COMPLETION_TIMEOUT_MS,
  logContext = {},
  retry = {},
  usageAttribution = null,
  usageSink = null,
} = {}) {
  const baseUrl = normalizeBaseUrl(config?.baseUrl || 'https://opencode.ai/zen/v1');
  const apiKey = config?.apiKey;
  if (!apiKey) {
    throw new Error('OpenCode Zen API key is missing. Please set OPENCODE_API_KEY in your .env file or configure a personal key in Settings → Vault.');
  }
  const payload = {
    model: config?.model || body?.model,
    input: chatMessagesToResponsesInput(body?.messages),
    max_output_tokens: body?.max_tokens || body?.max_completion_tokens || undefined,
    tools: chatToolsToResponsesTools(body?.tools),
    tool_choice: body?.tool_choice || undefined,
    reasoning: normalizeReasoningEffort(
      body?.reasoning_effort ?? process.env.OPENCODE_REASONING_EFFORT ?? null,
    ) || undefined,
  };
  if (payload.reasoning) payload.reasoning = { effort: payload.reasoning };
  const retryOptions = normalizeRetryOptions(retry);
  const done = aiGatewayLog.startTimer();
  const context = logContext && typeof logContext === 'object' ? logContext : {};

  const maxAttempts = Math.max(retryOptions.maxRetries, retryOptions.max429Retries) + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      aiGatewayLog.debug('responses request', {
        ...context, provider: config?.provider || null, baseUrl,
        model: payload.model, attempt: attempt + 1,
      });
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = chatCompletionHttpError(response.status, await response.text(), response.headers?.get?.('retry-after') || null);
        if (attempt < maxRetriesForStatus(response.status, retryOptions) && err.retryable) {
          await sleepRetry({ attempt, retryOptions, response, error: err, baseDelayMs: baseDelayForStatus(response.status, retryOptions), model: payload.model, context });
          continue;
        }
        recordResponsesUsage({ ok: false, config, baseUrl, payload, error: err, ms: done(), attempt, context, usageAttribution, usageSink });
        throw err;
      }
      const normalized = normalizeResponsesResponse(await response.json(), payload.model);
      recordResponsesUsage({ ok: true, config, baseUrl, payload, data: normalized, ms: done(), attempt, context, usageAttribution, usageSink });
      return normalized;
    } catch (err) {
      if (err?.name === 'ChatCompletionHttpError') throw err;
      if (attempt < retryOptions.maxRetries && isRetryableNetworkError(err)) {
        await sleepRetry({ attempt, retryOptions, error: err });
        continue;
      }
      recordResponsesUsage({ ok: false, config, baseUrl, payload, error: err, ms: done(), attempt, context, usageAttribution, usageSink });
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function recordResponsesUsage({ ok, config, baseUrl, payload, data = null, error = null, ms, attempt, context, usageAttribution, usageSink }) {
  const record = buildChatUsageRecord({
    ok, config, baseUrl, payload: { ...payload, model: payload?.model }, data, error, ms,
    attempts: attempt + 1, context,
  });
  recordChatUsage(createLogger('ai'), record);
  void usageSink?.({ record, attribution: usageAttribution || {} });
}

async function sleepRetry({ attempt, retryOptions, response = null, error, baseDelayMs, model, context }) {
  const delayMs = nextRetryDelayMs({
    attempt,
    baseDelayMs: baseDelayMs ?? retryOptions.baseDelayMs,
    retryAfter: response?.headers?.get?.('retry-after') || null,
    status: error?.status || response?.status || null,
  });
  aiGatewayLog.warn('responses retry', {
    ...context,
    model,
    attempt: attempt + 1,
    nextAttempt: attempt + 2,
    delayMs,
    status: error?.status,
    error: error?.message,
  });
  if (delayMs > 0) await retryOptions.sleep(delayMs);
}
