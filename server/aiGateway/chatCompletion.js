import { createLogger } from '../logger.js';
import {
  DEFAULT_CHAT_BASE_URL,
  getDefaultChatApiKey,
  normalizeBaseUrl,
  resolveChatModelConfig,
} from './providers.js';
import {
  baseDelayForStatus,
  chatCompletionHttpError,
  isRetryableNetworkError,
  maxRetriesForStatus,
  nextRetryDelayMs,
  normalizeRetryOptions,
} from './retryPolicy.js';
import {
  buildChatUsageRecord,
  recordChatUsage,
} from './usage.js';
import {
  isGoogleNativeChatProvider,
  requestGeminiNativeChatCompletion,
} from './geminiNativeChat.js';
import { prepareCohereToolPayload } from './cohereTools.js';
import { isResponsesModel, requestResponsesCompletion } from './responsesClient.js';

export const aiGatewayLog = createLogger('ai');
export const CHAT_COMPLETION_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.AGENT_TASK_WORKER_TIMEOUT_MS) || 120000
);

export async function requestChatCompletion({
  config = resolveChatModelConfig(),
  body,
  timeoutMs = CHAT_COMPLETION_TIMEOUT_MS,
  logContext = {},
  retry = {},
  usageAttribution = null,
  usageSink = null,
} = {}) {
  const modelPayload = config?.model && !body?.model ? { ...body, model: config.model } : body;
  const payload = config?.provider === 'cohere'
    ? prepareCohereToolPayload(modelPayload)
    : modelPayload;
  const baseUrl = normalizeBaseUrl(config?.baseUrl || DEFAULT_CHAT_BASE_URL);
  let apiKey = config?.apiKey;
  if (!apiKey && !['cohere', 'openrouter', 'moonshot', 'kimi', 'opencode'].includes(config?.provider)) {
    apiKey = getDefaultChatApiKey();
  }

  if (config?.provider === 'cohere' && !apiKey) {
    throw new Error('Cohere API key is missing. Set COHERE_API_KEY, COHERE_PAID_API_KEY, or COHERE_NON_COMMERCIAL_KEY, or configure a personal Cohere key.');
  }

  if (config?.provider === 'openrouter' && !apiKey) {
    throw new Error('OpenRouter API key is missing. Please set OPENROUTER_API_KEY in your .env file or configure a personal API key.');
  }

  if ((config?.provider === 'moonshot' || config?.provider === 'kimi') && !apiKey) {
    throw new Error('Moonshot API key is missing. Please set MOONSHOT_API_KEY in your .env file or configure a personal API key.');
  }

  if (config?.provider === 'opencode' && !apiKey) {
    throw new Error('OpenCode Zen API key is missing. Please set OPENCODE_API_KEY in your .env file or configure a personal key in Settings → Vault.');
  }

  const retryOptions = normalizeRetryOptions(retry);
  const done = aiGatewayLog.startTimer();
  const context = logContext && typeof logContext === 'object' ? logContext : {};

  if (isGoogleNativeChatProvider(config)) {
    return requestGeminiNativeChatCompletion({
      config,
      body: payload,
      timeoutMs,
      logContext: context,
      usageAttribution,
      usageSink,
    });
  }

  if (isResponsesModel(config?.provider, config?.model || modelPayload?.model)) {
    return requestResponsesCompletion({
      config,
      body: modelPayload,
      timeoutMs,
      logContext: context,
      retry,
      usageAttribution,
      usageSink,
    });
  }

  // Attempt budget is status-aware: 429s get the patient lane (up to ~a
  // minute of exponential backoff), everything else keeps the fast lane.
  const maxAttempts = Math.max(retryOptions.maxRetries, retryOptions.max429Retries) + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    aiGatewayLog.debug('chat completion request', {
      ...context,
      provider: config?.provider || null,
      baseUrl,
      model: payload?.model,
      messages: Array.isArray(payload?.messages) ? payload.messages.length : 0,
      tools: Array.isArray(payload?.tools) ? payload.tools.length : 0,
      attempt: attempt + 1,
    });

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = chatCompletionHttpError(response.status, await response.text(), response.headers?.get?.('retry-after') || null);
        if (attempt < maxRetriesForStatus(response.status, retryOptions) && err.retryable) {
          await waitForRetry({ attempt, retryOptions, response, payload, context, error: err, baseDelayMs: baseDelayForStatus(response.status, retryOptions) });
          continue;
        }
        recordUsage({ ok: false, config, baseUrl, payload, error: err, ms: done(), attempt, context, usageAttribution, usageSink });
        throw err;
      }

      const data = await response.json();
      recordUsage({ ok: true, config, baseUrl, payload, data, ms: done(), attempt, context, usageAttribution, usageSink });
      return data;
    } catch (err) {
      if (err?.name === 'ChatCompletionHttpError') {
        throw err;
      }
      if (err?.name === 'AbortError') {
        aiGatewayLog.error('chat completion timed out', {
          ...context,
          model: payload?.model,
          timeoutMs,
          ms: done(),
        });
      } else if (attempt < retryOptions.maxRetries && isRetryableNetworkError(err)) {
        await waitForRetry({ attempt, retryOptions, payload, context, error: err, baseDelayMs: retryOptions.baseDelayMs });
        continue;
      }
      recordUsage({ ok: false, config, baseUrl, payload, error: err, ms: done(), attempt, context, usageAttribution, usageSink });
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function recordUsage({ ok, config, baseUrl, payload, data = null, error = null, ms, attempt, context, usageAttribution, usageSink }) {
  const record = buildChatUsageRecord({
    ok,
    config,
    baseUrl,
    payload,
    data,
    error,
    ms,
    attempts: attempt + 1,
    context,
  });
  recordChatUsage(aiGatewayLog, record);
  void usageSink?.({ record, attribution: usageAttribution || {} });
}

async function waitForRetry({ attempt, retryOptions, response = null, payload, context, error, baseDelayMs }) {
  const delayMs = nextRetryDelayMs({
    attempt,
    baseDelayMs: baseDelayMs ?? retryOptions.baseDelayMs,
    retryAfter: response?.headers?.get?.('retry-after') || null,
    status: error?.status || response?.status || null,
  });
  aiGatewayLog.warn('chat completion retry', {
    ...context,
    model: payload?.model,
    attempt: attempt + 1,
    nextAttempt: attempt + 2,
    delayMs,
    status: error?.status,
    error: error?.message,
  });
  if (delayMs > 0) await retryOptions.sleep(delayMs);
}
