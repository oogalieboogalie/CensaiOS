import { createLogger } from '../logger.js';
import { normalizeBaseUrl } from './providers.js';
import { resolveEmbeddingModelConfig } from './embeddingProviders.js';
import {
  buildEmbeddingUsageRecord,
  recordEmbeddingUsage,
} from './usage.js';

export const EMBEDDING_MODEL_KIND = 'embedding';
export const EMBEDDING_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.EMBEDDING_TIMEOUT_MS) || 30000
);
export const embeddingLog = createLogger('ai');

export async function requestEmbedding({
  config = resolveEmbeddingModelConfig(),
  body,
  timeoutMs = EMBEDDING_TIMEOUT_MS,
  logContext = {},
  usageAttribution = null,
  usageSink = null,
} = {}) {
  const payload = config?.model && !body?.model ? { ...body, model: config.model } : body;
  const baseUrl = normalizeBaseUrl(config?.baseUrl || 'http://localhost:11434/v1');
  const endpoint = config?.endpoint || '/embeddings';
  const controller = new AbortController();
  const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  const done = embeddingLog.startTimer();
  const context = logContext && typeof logContext === 'object' ? logContext : {};

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config?.apiKey || ''}`,
        ...(config?.headers || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = embeddingHttpError(response.status, await response.text());
      recordUsage(buildEmbeddingUsageRecord({
        ok: false,
        config,
        baseUrl,
        endpoint,
        payload,
        error: err,
        ms: done(),
        context,
      }), usageAttribution, usageSink);
      throw err;
    }

    const data = await response.json();
    recordUsage(buildEmbeddingUsageRecord({
      ok: true,
      config,
      baseUrl,
      endpoint,
      payload,
      data,
      ms: done(),
      context,
    }), usageAttribution, usageSink);
    return data;
  } catch (err) {
    if (err?.name !== 'EmbeddingHttpError') {
      recordUsage(buildEmbeddingUsageRecord({
        ok: false,
        config,
        baseUrl,
        endpoint,
        payload,
        error: err,
        ms: done(),
        context,
      }), usageAttribution, usageSink);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function recordUsage(record, attribution, usageSink) {
  recordEmbeddingUsage(embeddingLog, record);
  void usageSink?.({ record, attribution: attribution || {} });
}

function embeddingHttpError(status, body) {
  const error = new Error(`${status}: ${body}`);
  error.name = 'EmbeddingHttpError';
  error.status = status;
  error.body = body;
  return error;
}
