export const DEFAULT_CHAT_RETRY_COUNT = clampInteger(process.env.AI_GATEWAY_MAX_RETRIES, 1, 0, 3);
export const DEFAULT_CHAT_RETRY_BASE_MS = clampInteger(process.env.AI_GATEWAY_RETRY_BASE_MS, 250, 0, 5000);
// Rate limits (429) get their own patient lane: free tiers throttle hard and
// recover, so we back off exponentially for up to ~a minute instead of
// failing the turn on the first squeeze.
export const DEFAULT_429_MAX_RETRIES = clampInteger(process.env.AI_GATEWAY_429_MAX_RETRIES, 5, 0, 10);
export const DEFAULT_429_BASE_MS = clampInteger(process.env.AI_GATEWAY_429_BASE_MS, 2000, 0, 30000);

export function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

export function isRetryableNetworkError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return false;
  return error.name === 'TypeError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
}

export function nextRetryDelayMs({
  attempt,
  baseDelayMs = DEFAULT_CHAT_RETRY_BASE_MS,
  retryAfter = null,
  status = null,
  random = Math.random,
} = {}) {
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  if (retryAfterMs !== null) return retryAfterMs;
  const base = statusBaseDelayMs(status, baseDelayMs);
  const exponent = Math.max(0, Number(attempt) || 0);
  const cap = base * (2 ** exponent);
  const jitter = typeof random === 'function' ? Number(random()) : Math.random();
  const boundedJitter = Number.isFinite(jitter) ? Math.min(1, Math.max(0, jitter)) : Math.random();
  return Math.round(cap * boundedJitter);
}

export function normalizeRetryOptions(options = {}) {
  return {
    maxRetries: clampInteger(options.maxRetries, DEFAULT_CHAT_RETRY_COUNT, 0, 3),
    baseDelayMs: clampInteger(options.baseDelayMs, DEFAULT_CHAT_RETRY_BASE_MS, 0, 5000),
    max429Retries: clampInteger(options.max429Retries, DEFAULT_429_MAX_RETRIES, 0, 10),
    base429Ms: clampInteger(options.base429Ms, DEFAULT_429_BASE_MS, 0, 30000),
    sleep: typeof options.sleep === 'function' ? options.sleep : sleep,
  };
}

export function maxRetriesForStatus(status, retryOptions) {
  return status === 429
    ? (retryOptions?.max429Retries ?? DEFAULT_429_MAX_RETRIES)
    : (retryOptions?.maxRetries ?? DEFAULT_CHAT_RETRY_COUNT);
}

export function baseDelayForStatus(status, retryOptions) {
  return status === 429
    ? (retryOptions?.base429Ms ?? DEFAULT_429_BASE_MS)
    : (retryOptions?.baseDelayMs ?? DEFAULT_CHAT_RETRY_BASE_MS);
}

export function chatCompletionHttpError(status, body, retryAfter = null) {
  const error = new Error(`${status}: ${body}`);
  error.name = 'ChatCompletionHttpError';
  error.status = status;
  error.body = body;
  error.retryAfter = retryAfter;
  error.retryable = isRetryableStatus(status);
  return error;
}
function parseRetryAfterMs(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function statusBaseDelayMs(status, baseDelayMs) {
  const base = Math.max(0, Number(baseDelayMs) || 0);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return Math.round(base * 0.5);
  }
  if (status === 502 || status === 503 || status === 504) {
    return base;
  }
  if (status >= 500 && status < 600) {
    return Math.round(base * 0.75);
  }
  return base;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(max, Math.max(min, integer));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
