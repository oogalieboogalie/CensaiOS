// A provider refusal (not a bad key, not a rate limit) becomes one plain
// sentence for the chat. The raw body stays on the error for debugging and
// is never shown. Keys are stripped. The warning names the provider, the
// status and the provider's error type — never the message text.
import { createLogger } from '../logger.js';
import { isGoogleInvalidApiKey, KEY_PROVIDER_NAMES, keyProviderFor } from './missingKey.js';

const log = createLogger('ai-gateway');

const KEY_SHAPES = [
  /\b(?:sk|xai)-[A-Za-z0-9_-]{8,}\b/gi,
  /\bAIza[0-9A-Za-z_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+/gi,
];

// Timeouts and conflicts are retried. A refusal is the provider saying no.
const TRANSIENT_STATUS = new Set([408, 409, 425, 429]);

export function scrubKeys(text) {
  let out = String(text ?? '');
  for (const pattern of KEY_SHAPES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '[hidden]');
  }
  return out;
}

export function providerLabel(provider) {
  const id = keyProviderFor(provider);
  return KEY_PROVIDER_NAMES[id] || 'The AI provider';
}

export function isPlainRefusal(status, body, provider) {
  const code = Number(status);
  if (!Number.isInteger(code) || code < 400 || code >= 500) return false;
  if (code === 401 || TRANSIENT_STATUS.has(code)) return false;
  if (isGoogleInvalidApiKey(code, body, provider)) return false;
  return true;
}

/** The one sentence the chat shows. Null when this is not that kind of refusal. */
export function plainRefusalSentence(provider, body) {
  const { sentence } = readProviderError(body);
  return `${providerLabel(provider)} turned this down: ${sentence}`;
}

/**
 * Attach the sentence and log once. Returns null for a bad key, a rate
 * limit, or anything we still retry.
 */
export function noteProviderRefusal(provider, status, body) {
  if (!isPlainRefusal(status, body, provider)) return null;
  const { errorType } = readProviderError(body);
  log.warn('provider turned a message down', {
    provider: loggedProvider(provider),
    status: Number(status),
    errorType,
  });
  return plainRefusalSentence(provider, body);
}

function loggedProvider(provider) {
  const known = keyProviderFor(provider);
  if (known) return known;
  const raw = scrubKeys(String(provider || '')).trim().slice(0, 40);
  if (!raw || raw.includes('[hidden]')) return null;
  return raw;
}

export function readProviderError(body) {
  const parsed = asObject(body);
  const error = errorNode(parsed);
  const rawMessage = firstText(error?.message, parsed ? null : body);
  const errorType = firstText(
    typeof error?.type === 'string' ? error.type : null,
    typeof error?.status === 'string' ? error.status : null,
    typeof error?.code === 'string' ? error.code : null,
    reasonOf(error),
  );
  return { sentence: toSentence(rawMessage), errorType: safeToken(errorType) };
}

function asObject(body) {
  if (body && typeof body === 'object') return body;
  const text = String(body ?? '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorNode(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const error = parsed.error;
  if (error && typeof error === 'object' && !Array.isArray(error)) return error;
  return parsed;
}

function reasonOf(error) {
  const details = Array.isArray(error?.details) ? error.details : [];
  const found = details.find((item) => typeof item?.reason === 'string');
  return found?.reason || null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toSentence(raw) {
  let text = scrubKeys(String(raw || '')).replace(/`/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return 'It gave no reason.';
  const end = text.search(/[.!?](\s|$)/);
  if (end !== -1) text = text.slice(0, end + 1);
  else if (text.length > 220) text = `${text.slice(0, 220).trim()}…`;
  if (!/[.!?…]$/.test(text)) text += '.';
  return text;
}

function safeToken(value) {
  const text = scrubKeys(String(value || '')).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!text || text.includes('[hidden]')) return null;
  return text;
}
