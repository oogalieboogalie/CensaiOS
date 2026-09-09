import { jest } from '@jest/globals';
import { sendMessageWithMeta } from '../src/lib/chat.js';

function response(body, { status = 429, contentType = 'application/json', retryAfter = '30' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(name => name.toLowerCase() === 'content-type' ? contentType : retryAfter) },
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('chat client error honesty', () => {
  afterEach(() => delete global.fetch);

  test('preserves structured quota errors instead of inventing a fallback reply', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({
      code: 'FREE_TIER_USER_DAILY_LIMIT',
      message: 'Daily free AI request limit reached.',
      retryAfter: 60,
      allowance: { remaining: 0 },
    }));

    await expect(sendMessageWithMeta('atlas', [{ from: 'me', text: 'hello' }]))
      .rejects.toMatchObject({
        message: 'Daily free AI request limit reached.',
        status: 429,
        code: 'FREE_TIER_USER_DAILY_LIMIT',
        retryAfter: 60,
        details: { allowance: { remaining: 0 } },
      });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('names network failures instead of returning a scripted agent answer', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    await expect(sendMessageWithMeta('atlas', [{ from: 'me', text: 'hello' }]))
      .rejects.toMatchObject({
        code: 'CHAT_NETWORK_ERROR',
        message: 'The AI service could not be reached. Try again shortly.',
      });
  });
});
