import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../logger.js';
import {
  buildChatUsageRecord,
  recordChatUsage,
} from './usage.js';

export const GOOGLE_NATIVE_PROVIDER = 'google-native';
export const geminiNativeChatLog = createLogger('ai');

export function isGoogleNativeChatProvider(config) {
  return config?.provider === GOOGLE_NATIVE_PROVIDER;
}

export async function requestGeminiNativeChatCompletion({
  config = {},
  body = {},
  timeoutMs,
  logContext = {},
  usageAttribution = null,
  usageSink = null,
} = {}) {
  const payload = config?.model && !body?.model ? { ...body, model: config.model } : body;
  const context = logContext && typeof logContext === 'object' ? logContext : {};
  const done = geminiNativeChatLog.startTimer();

  geminiNativeChatLog.debug('native Gemini chat completion request', {
    ...context,
    provider: config.provider,
    model: payload?.model,
    messages: Array.isArray(payload?.messages) ? payload.messages.length : 0,
    tools: Array.isArray(payload?.tools) ? payload.tools.length : 0,
  });

  try {
    const ai = new GoogleGenAI({ apiKey: config?.apiKey || '' });
    const data = await withTimeout(
      ai.models.generateContent(toGeminiRequest(payload)),
      timeoutMs
    );
    const response = toOpenAiChatResponse(data, payload.model);
    recordGeminiUsage({ ok: true, config, payload, data: response, ms: done(), context, usageAttribution, usageSink });
    return response;
  } catch (err) {
    recordGeminiUsage({ ok: false, config, payload, error: err, ms: done(), context, usageAttribution, usageSink });
    throw err;
  }
}

export function toGeminiRequest(payload = {}) {
  const { systemInstruction, contents } = toGeminiContents(payload.messages || []);
  return {
    model: payload.model,
    contents,
    ...(systemInstruction ? {
      config: {
        ...(payload.config || {}),
        systemInstruction,
      },
    } : payload.config ? { config: payload.config } : {}),
  };
}

function toGeminiContents(messages) {
  const systemParts = [];
  const contents = [];

  for (const message of messages) {
    const text = textFromMessageContent(message?.content);
    if (!text) continue;
    if (message.role === 'system') {
      systemParts.push(text);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
      parts: [{ text }],
    });
  }

  return {
    systemInstruction: systemParts.join('\n\n'),
    contents,
  };
}

function textFromMessageContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return part?.text || '';
    })
    .filter(Boolean)
    .join('\n');
}

function toOpenAiChatResponse(data, model) {
  const text = data?.text || firstTextPart(data);
  return {
    id: data?.responseId || data?.id || `gemini-native-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text || '',
      },
      finish_reason: firstFinishReason(data),
    }],
    usage: toOpenAiUsage(data?.usageMetadata || data?.usage),
  };
}

function firstTextPart(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part?.text || '')
    .filter(Boolean)
    .join('');
}

function firstFinishReason(data) {
  return data?.candidates?.[0]?.finishReason || data?.candidates?.[0]?.finish_reason || null;
}

function toOpenAiUsage(usage = {}) {
  return {
    prompt_tokens: usage.promptTokenCount ?? usage.prompt_tokens ?? 0,
    completion_tokens: usage.candidatesTokenCount ?? usage.completion_tokens ?? 0,
    total_tokens: usage.totalTokenCount ?? usage.total_tokens ?? 0,
  };
}

async function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(geminiNativeTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function geminiNativeTimeoutError(timeoutMs) {
  const error = new Error(`Native Gemini chat completion timed out after ${timeoutMs}ms`);
  error.name = 'GeminiNativeTimeoutError';
  error.retryable = true;
  return error;
}

function recordGeminiUsage({ ok, config, payload, data = null, error = null, ms, context, usageAttribution, usageSink }) {
  const record = buildChatUsageRecord({
    ok,
    config,
    baseUrl: GOOGLE_NATIVE_PROVIDER,
    payload,
    data,
    error,
    ms,
    attempts: 1,
    context,
  });
  recordChatUsage(geminiNativeChatLog, record);
  void usageSink?.({ record, attribution: usageAttribution || {} });
}
