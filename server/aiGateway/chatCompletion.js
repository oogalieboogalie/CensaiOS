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
import { payloadNeedsGeminiNative } from './multimodal.js';
import { isResponsesModel, requestResponsesCompletion } from './responsesClient.js';
import { assertProviderKey, localModelUnreachableError } from './missingKey.js';
import { isAnthropicProvider, requestAnthropicChatCompletion } from './anthropicChat.js';
import { canStreamChat, isEventStream, readChatCompletionStream, streamingPayload } from './chatStream.js';

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
  onDelta = null,
} = {}) {
  const modelPayload = config?.model && !body?.model ? { ...body, model: config.model } : body;
  const payload = config?.provider === 'cohere'
    ? prepareCohereToolPayload(modelPayload)
    : modelPayload;
  const baseUrl = normalizeBaseUrl(config?.baseUrl || DEFAULT_CHAT_BASE_URL);
  let apiKey = config?.apiKey;
  if (!apiKey && !['cohere', 'openai', 'openrouter', 'moonshot', 'kimi', 'opencode', 'zai', 'anthropic', 'claude'].includes(config?.provider)) {
    apiKey = getDefaultChatApiKey();
  }

  assertProviderKey(config?.provider, apiKey);

  // Claude goes through the Messages API, not an OpenAI-compatible endpoint.
  if (isAnthropicProvider(config)) {
    return requestAnthropicChatCompletion({
      config: { ...config, apiKey },
      body: modelPayload,
      timeoutMs,
      logContext,
      usageAttribution,
      usageSink,
      onDelta,
    });
  }

  const retryOptions = normalizeRetryOptions(retry);
  const done = aiGatewayLog.startTimer();
  const context = logContext && typeof logContext === 'object' ? logContext : {};

  // Gemini's OpenAI-compatible endpoint takes images and audio but not PDFs or
  // video, so a turn carrying those goes through the native API instead.
  const geminiNative = isGoogleNativeChatProvider(config)
    || (config?.provider === 'google' && payloadNeedsGeminiNative(payload));
  if (geminiNative) {
    return requestGeminiNativeChatCompletion({
      config: { ...config, provider: 'google-native' },
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

  // Spec 3: stream content deltas when the caller wants them and the
  // provider speaks OpenAI-style SSE. The assembled result is identical.
  const streaming = typeof onDelta === 'function' && canStreamChat(config);
  const requestPayload = streaming ? streamingPayload(config, payload) : payload;

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
        body: JSON.stringify(requestPayload),
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

      const data = streaming && isEventStream(response)
        ? await readChatCompletionStream(response, onDelta)
        : await response.json();
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
      throw localModelUnreachableError(err, baseUrl) || err;
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
