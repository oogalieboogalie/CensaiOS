const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;
const PUBLIC_SERVER_CODE = /^(FREE_TIER_|MODEL_ACCESS_|PLATFORM_MODEL_KIND_|SUB_AGENT_)/;

function statusCode(error) {
  const status = Number(error?.statusCode ?? error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function errorCode(error) {
  const code = String(error?.code || '').trim();
  return SAFE_ERROR_CODE.test(code) ? code : 'CHAT_REQUEST_FAILED';
}

function errorMessage(error, status, code) {
  const message = String(error?.message || '').trim();
  // Specific public codes (free-tier limits, access denials) carry their own
  // user-facing copy — never blanket them with the generic rate-limit text.
  if (message && PUBLIC_SERVER_CODE.test(code)) {
    return message.slice(0, 300);
  }
  if (status === 429 || /ratelimit|rate limit exceeded|too many requests/i.test(message)) {
    return 'The model is rate-limited right now (free tier). I already backed off and retried — wait a minute and send again.';
  }
  if (message && status < 500) {
    return message.slice(0, 300);
  }
  return 'The AI request could not be completed. Try again shortly.';
}

function retryAfterValue(error) {
  const value = error?.retryAfter ?? error?.retryAfterSeconds;
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!text || text.length > 64 || /[\r\n]/.test(text)) return null;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.min(86_400, Math.ceil(seconds)));
  }
  return text;
}

export function publicChatError(error, timings) {
  const status = statusCode(error);
  const code = errorCode(error);
  const retryAfter = retryAfterValue(error);
  return {
    status,
    retryAfter,
    body: {
      code,
      message: errorMessage(error, status, code),
      status,
      ...(retryAfter !== null ? { retryAfter } : {}),
      ...(timings ? { timings } : {}),
    },
  };
}

export function applyChatRetryHeader(res, retryAfter) {
  if (retryAfter !== null) res.setHeader('Retry-After', String(retryAfter));
}

export function sendPublicModelError(res, error, fallbackCode) {
  const normalized = publicChatError(error);
  const fallback = normalized.status === 403
    ? 'WORKSPACE_ACCESS_DENIED'
    : normalized.status === 404 ? 'WORKSPACE_NOT_FOUND' : fallbackCode;
  const code = normalized.body.code === 'CHAT_REQUEST_FAILED'
    ? fallback
    : normalized.body.code;
  applyChatRetryHeader(res, normalized.retryAfter);
  return res.status(normalized.status).json({
    error: normalized.body.message,
    code,
    retryAfter: normalized.retryAfter,
  });
}
