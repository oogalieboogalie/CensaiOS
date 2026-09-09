const SAFE_TEXT = /^[a-zA-Z0-9_.:/-]+$/;

function boundedText(value, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!text || text.length > maxLength || !SAFE_TEXT.test(text)) return undefined;
  return text;
}

function boundedInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
}

function isoTimestamp(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function buildFreeTierEventPayload(eventType, input = {}) {
  if (eventType === 'ai.free_tier.reserved') {
    return compact({
      status: 'reserved',
      source: boundedText(input.source, 64),
      provider: boundedText(input.provider, 32),
      model: boundedText(input.model, 128),
      dayStart: isoTimestamp(input.dayStart),
      dayEnd: isoTimestamp(input.dayEnd),
    });
  }

  if (eventType === 'ai.free_tier.consumed') {
    return compact({
      status: 'consumed',
      source: boundedText(input.source, 64),
      attempts: boundedInteger(input.attempts, 1, 20),
    });
  }

  if (eventType === 'ai.free_tier.released') {
    return compact({
      status: 'released',
      source: boundedText(input.source, 64),
      reasonCode: boundedText(input.reasonCode, 64),
      httpStatus: boundedInteger(input.httpStatus, 400, 599),
      retryAfterSeconds: boundedInteger(input.retryAfterSeconds, 0, 86_400),
      attempts: boundedInteger(input.attempts, 1, 20),
    });
  }

  throw new TypeError(`Unsupported free-tier event type: ${eventType}`);
}
