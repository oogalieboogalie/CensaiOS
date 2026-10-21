import {
  MODEL_KEY_MISSING,
  MODEL_KEY_REJECTED,
  missingKeyMessage,
  rejectedKeyMessage,
} from '../../aiGateway/missingKey.js';
import { isPlainRefusal, plainRefusalSentence, scrubKeys } from '../../aiGateway/providerRefusal.js';

const KEY_CODES = new Set([MODEL_KEY_MISSING, MODEL_KEY_REJECTED, 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED']);

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;
// HOSTED_AGENT_ messages are written in server/hostedAgents and never carry a key or a vendor body.
const PUBLIC_SERVER_CODE = /^(FREE_TIER_|MODEL_ACCESS_|PLATFORM_MODEL_KIND_|SUB_AGENT_|HOSTED_AGENT_)/;

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
  // No key is never a passing outage: name the key, in plain words.
  if (code === MODEL_KEY_MISSING) return missingKeyMessage(error?.keyProvider);
  if (code === MODEL_KEY_REJECTED) return rejectedKeyMessage(error?.keyProvider);
  // Specific public codes (free-tier limits, access denials) carry their own
  // user-facing copy — never blanket them with the generic rate-limit text.
  if (message && PUBLIC_SERVER_CODE.test(code)) {
    return message.slice(0, 300);
  }
  if (status === 429 || /ratelimit|rate limit exceeded|too many requests/i.test(message)) {
    return 'The model is rate-limited right now (free tier). I already backed off and retried — wait a minute and send again.';
  }
  const refusal = refusalText(error, status);
  if (refusal) return refusal;
  if (message && status < 500) {
    return scrubKeys(message).slice(0, 300);
  }
  return 'The AI request could not be completed. Try again shortly.';
}

function refusalText(error, status) {
  if (error?.refusalSentence) return scrubKeys(error.refusalSentence).slice(0, 300);
  if (error?.name === 'ChatCompletionHttpError' && isPlainRefusal(status, error?.body, error?.provider)) {
    return plainRefusalSentence(error.provider, error.body);
  }
  return null;
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
      ...(KEY_CODES.has(code) ? { keyProvider: error?.keyProvider || null } : {}),
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
    ...(KEY_CODES.has(code) ? { keyProvider: normalized.body.keyProvider ?? null } : {}),
  });
}

/** Image routes: a missing key says so in image words, with whose key. */
export function sendImageModelError(res, error, fallbackCode = 'IMAGE_GENERATION_FAILED') {
  if (error?.code !== MODEL_KEY_MISSING) return sendPublicModelError(res, error, fallbackCode);
  return res.status(400).json({
    error: String(error.message || missingKeyMessage(error.keyProvider)).slice(0, 300),
    code: MODEL_KEY_MISSING,
    keyProvider: error.keyProvider || null,
    retryAfter: null,
  });
}
