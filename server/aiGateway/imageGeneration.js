import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../logger.js';
import { resolveImageGenerationModelConfig } from './imageProviders.js';
import {
  buildImageGenerationUsageRecord,
  recordImageGenerationUsage,
} from './usage.js';

export const IMAGE_GENERATION_MODEL_KIND = 'image.generation';
export const IMAGE_GENERATION_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.IMAGE_GENERATION_TIMEOUT_MS) || 60000
);
export const imageGenerationLog = createLogger('ai');

export async function requestImageGeneration({
  config = resolveImageGenerationModelConfig(),
  body = {},
  timeoutMs = IMAGE_GENERATION_TIMEOUT_MS,
  logContext = {},
  usageAttribution = null,
  usageSink = null,
} = {}) {
  const payload = imageGenerationPayload(config, body);
  const done = imageGenerationLog.startTimer();
  const context = logContext && typeof logContext === 'object' ? logContext : {};

  try {
    if (config?.provider !== 'google') {
      throw imageGenerationProviderError(config?.provider);
    }

    const ai = new GoogleGenAI({ apiKey: config?.apiKey || '' });
    const data = await withTimeout(requestGoogleImage(ai, payload), timeoutMs);
    recordUsage(buildImageGenerationUsageRecord({
      ok: true,
      config,
      payload,
      data,
      ms: done(),
      context,
    }), usageAttribution, usageSink);
    return data;
  } catch (err) {
    recordUsage(buildImageGenerationUsageRecord({
      ok: false,
      config,
      payload,
      error: err,
      ms: done(),
      context,
    }), usageAttribution, usageSink);
    throw err;
  }
}

function recordUsage(record, attribution, usageSink) {
  recordImageGenerationUsage(imageGenerationLog, record);
  void usageSink?.({ record, attribution: attribution || {} });
}

function imageGenerationPayload(config, body) {
  const { prompt, ...rest } = body || {};
  const payload = {
    ...rest,
    model: rest.model || config?.model,
  };
  if (!payload.contents && prompt) payload.contents = prompt;
  return payload;
}

function requestGoogleImage(ai, payload) {
  if (isImagenModel(payload.model)) {
    const { contents, prompt, model, config, ...rest } = payload;
    return ai.models.generateImages({
      ...rest,
      model,
      prompt: prompt || contents,
      config: {
        numberOfImages: 1,
        includeRaiReason: true,
        ...(config || {}),
      },
    });
  }
  return ai.models.generateContent(payload);
}

function isImagenModel(model) {
  return String(model || '').startsWith('imagen-');
}

async function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(imageGenerationTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function imageGenerationProviderError(provider) {
  const error = new Error(`Unsupported image generation provider: ${provider || 'unknown'}`);
  error.name = 'ImageGenerationProviderError';
  return error;
}

function imageGenerationTimeoutError(timeoutMs) {
  const error = new Error(`Image generation timed out after ${timeoutMs}ms`);
  error.name = 'ImageGenerationTimeoutError';
  error.retryable = true;
  return error;
}
