import { jest } from '@jest/globals';
import { sendMessageWithMeta } from '../src/lib/chat.js';

function ndjsonTextResponse(text) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: { get: jest.fn(() => 'application/x-ndjson') },
    body,
  };
}

function ndjsonResponse(events) {
  return ndjsonTextResponse(`${events.map(event => JSON.stringify(event)).join('\n')}\n`);
}

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

test('preserves a structured error emitted after an accepted streaming round', async () => {
  global.fetch = jest.fn().mockResolvedValue(ndjsonResponse([
    { type: 'status', status: 'thinking' },
    {
      type: 'error',
      error: {
        status: 503,
        code: 'FREE_TIER_PROVIDER_UNAVAILABLE',
        message: 'The free AI provider is temporarily unavailable',
        retryAfter: 9,
        allowance: { user: { remaining: 2 } },
      },
    },
  ]));

  await expect(sendMessageWithMeta('atlas', [{ from: 'me', text: 'hello' }]))
    .rejects.toMatchObject({
      status: 503,
      code: 'FREE_TIER_PROVIDER_UNAVAILABLE',
      message: 'The free AI provider is temporarily unavailable',
      retryAfter: 9,
      details: { allowance: { user: { remaining: 2 } } },
    });
});

test('rejects a truncated stream without a terminal result or error', async () => {
  global.fetch = jest.fn().mockResolvedValue(ndjsonResponse([
    { type: 'status', status: 'thinking' },
  ]));

  await expect(sendMessageWithMeta('atlas', [{ from: 'me', text: 'hello' }]))
    .rejects.toMatchObject({
      code: 'CHAT_STREAM_INCOMPLETE',
      message: 'The AI response ended before a final result arrived. Try again.',
    });
});

test('rejects a malformed terminal event as an incomplete stream', async () => {
  const parseLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn().mockResolvedValue(ndjsonTextResponse(
    '{"type":"status","status":"thinking"}\n{"type":"result"'
  ));

  await expect(sendMessageWithMeta('atlas', [{ from: 'me', text: 'hello' }]))
    .rejects.toMatchObject({ code: 'CHAT_STREAM_INCOMPLETE' });
  expect(parseLog).toHaveBeenCalledWith(
    'Failed to parse streaming line:', expect.any(SyntaxError), '{"type":"result"'
  );
});
