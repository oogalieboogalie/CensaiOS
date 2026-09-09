import {
  chatCompletionHttpError,
  isRetryableNetworkError,
  isRetryableStatus,
  nextRetryDelayMs,
  normalizeRetryOptions,
} from '../server/aiGateway/retryPolicy.js';

describe('AI Gateway retry policy', () => {
  test('marks transient HTTP statuses as retryable', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  test('retries network failures but not explicit timeouts', () => {
    expect(isRetryableNetworkError(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }))).toBe(true);
    expect(isRetryableNetworkError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableNetworkError({ name: 'AbortError' })).toBe(false);
  });

  test('computes bounded retry options and jittered delays', () => {
    expect(normalizeRetryOptions({ maxRetries: 99, baseDelayMs: -10 })).toMatchObject({
      maxRetries: 3,
      baseDelayMs: 0,
    });
    expect(nextRetryDelayMs({ attempt: 0, baseDelayMs: 100, random: () => 0 })).toBe(0);
    expect(nextRetryDelayMs({ attempt: 2, baseDelayMs: 100, random: () => 1 })).toBe(400);
    expect(nextRetryDelayMs({ attempt: 2, baseDelayMs: 100, random: () => 0.5 })).toBe(200);
    expect(nextRetryDelayMs({ retryAfter: '2', baseDelayMs: 100 })).toBe(2000);
  });

  test('applies status-specific retry caps after retry-after', () => {
    expect(nextRetryDelayMs({
      attempt: 1,
      baseDelayMs: 200,
      status: 429,
      random: () => 1,
    })).toBe(200);
    expect(nextRetryDelayMs({
      attempt: 1,
      baseDelayMs: 200,
      status: 503,
      random: () => 1,
    })).toBe(400);
    expect(nextRetryDelayMs({
      attempt: 1,
      baseDelayMs: 200,
      status: 429,
      retryAfter: '3',
      random: () => 0,
    })).toBe(3000);
  });

  test('creates typed HTTP errors with retry metadata', () => {
    const retryable = chatCompletionHttpError(429, 'rate limited', '7');
    expect(retryable).toMatchObject({
      name: 'ChatCompletionHttpError',
      message: '429: rate limited',
      status: 429,
      retryable: true,
      retryAfter: '7',
    });
    expect(chatCompletionHttpError(400, 'bad request')).toMatchObject({
      status: 400,
      retryable: false,
    });
  });
});
