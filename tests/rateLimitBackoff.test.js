import {
  baseDelayForStatus,
  DEFAULT_429_BASE_MS,
  DEFAULT_429_MAX_RETRIES,
  DEFAULT_CHAT_RETRY_BASE_MS,
  DEFAULT_CHAT_RETRY_COUNT,
  maxRetriesForStatus,
  nextRetryDelayMs,
  normalizeRetryOptions,
} from '../server/aiGateway/retryPolicy.js';

describe('rate-limit backoff lane', () => {
  test('429s get the patient lane, others the fast lane', () => {
    const opts = normalizeRetryOptions({});
    expect(maxRetriesForStatus(429, opts)).toBe(DEFAULT_429_MAX_RETRIES);
    expect(maxRetriesForStatus(429, opts)).toBeGreaterThan(DEFAULT_CHAT_RETRY_COUNT);
    expect(maxRetriesForStatus(500, opts)).toBe(DEFAULT_CHAT_RETRY_COUNT);
    expect(baseDelayForStatus(429, opts)).toBe(DEFAULT_429_BASE_MS);
    expect(baseDelayForStatus(500, opts)).toBe(DEFAULT_CHAT_RETRY_BASE_MS);
  });

  test('429 backoff grows exponentially with jitter cap', () => {
    const d0 = nextRetryDelayMs({ attempt: 0, baseDelayMs: 2000, status: 429, random: () => 1 });
    const d2 = nextRetryDelayMs({ attempt: 2, baseDelayMs: 2000, status: 429, random: () => 1 });
    expect(d0).toBe(1000); // 429 base is halved: 2000 * 0.5
    expect(d2).toBe(4000);
    expect(d2).toBeGreaterThan(d0);
  });

  test('Retry-After header wins over computed backoff', () => {
    expect(nextRetryDelayMs({ attempt: 0, baseDelayMs: 2000, status: 429, retryAfter: '7' })).toBe(7000);
  });

  test('callers can tune the 429 lane per request', () => {
    const opts = normalizeRetryOptions({ max429Retries: 2, base429Ms: 500 });
    expect(maxRetriesForStatus(429, opts)).toBe(2);
    expect(baseDelayForStatus(429, opts)).toBe(500);
  });
});
