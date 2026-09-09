import { jest } from '@jest/globals';
import {
  buildChatUsageRecord,
  recordChatUsage,
} from '../server/aiGateway/usage.js';

describe('AI Gateway usage records', () => {
  test('builds prompt-free success usage metadata', () => {
    const record = buildChatUsageRecord({
      ok: true,
      config: { provider: 'openrouter', model: 'fallback-model' },
      baseUrl: 'https://openrouter.ai/api/v1',
      payload: {
        model: 'chat-model',
        messages: [{ role: 'user', content: 'secret prompt' }],
        tools: [{ type: 'function' }],
      },
      data: {
        choices: [{ finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      ms: 123,
      attempts: 2,
      context: { source: 'chat-loop' },
    });

    expect(record).toEqual({
      type: 'chat_completion',
      ok: true,
      source: 'chat-loop',
      provider: 'openrouter',
      model: 'chat-model',
      baseUrl: 'https://openrouter.ai/api/v1',
      ms: 123,
      attempts: 2,
      messages: 1,
      tools: 1,
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    expect(JSON.stringify(record)).not.toContain('secret prompt');
  });

  test('builds failure usage metadata without credentials or payload content', () => {
    const err = Object.assign(new Error('503: unavailable'), {
      name: 'ChatCompletionHttpError',
      status: 503,
      retryable: true,
    });
    const record = buildChatUsageRecord({
      ok: false,
      config: { provider: 'google', model: 'gemini' },
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      payload: { messages: [{ role: 'user', content: 'private' }] },
      error: err,
      ms: 50,
    });

    expect(record.error).toEqual({
      name: 'ChatCompletionHttpError',
      message: 'Provider request failed (503)',
      status: 503,
      retryable: true,
    });
    expect(JSON.stringify(record)).not.toContain('private');
    expect(JSON.stringify(record)).not.toContain('unavailable');
  });

  test('routes success and failure records to the expected log level', () => {
    const log = { info: jest.fn(), error: jest.fn() };
    recordChatUsage(log, { ok: true, type: 'chat_completion' });
    recordChatUsage(log, { ok: false, type: 'chat_completion' });

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
