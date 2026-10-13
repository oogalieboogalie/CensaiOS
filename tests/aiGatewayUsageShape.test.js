import {
  buildChatUsageRecord,
  buildEmbeddingUsageRecord,
  buildImageGenerationUsageRecord,
} from '../server/aiGateway/usage.js';
import { usageEventPayload } from '../server/aiGateway/usageSink.js';

describe('AI Gateway usage schema shape', () => {
  test('chat usage exposes the proposed DB contract fields', () => {
    const error = Object.assign(new Error('rate limited'), {
      name: 'RateLimitError',
      status: 429,
      retryable: true,
    });
    const record = buildChatUsageRecord({
      ok: false,
      config: { provider: 'openrouter', model: 'fallback-model' },
      baseUrl: 'https://openrouter.ai/api/v1',
      payload: {
        model: 'chat-model',
        messages: [{ role: 'user', content: 'private prompt' }],
        tools: [{ type: 'function' }],
      },
      data: {
        choices: [{ finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      },
      error,
      ms: 321,
      attempts: 3,
      context: { source: 'chat-loop' },
    });

    expect(record).toMatchObject({
      type: 'chat_completion',
      ok: false,
      source: 'chat-loop',
      provider: 'openrouter',
      model: 'chat-model',
      baseUrl: 'https://openrouter.ai/api/v1',
      ms: 321,
      attempts: 3,
      messages: 1,
      tools: 1,
      finishReason: 'tool_calls',
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
      error: {
        name: 'RateLimitError',
        message: 'Provider request failed (429)',
        status: 429,
        retryable: true,
      },
    });
    expect(JSON.stringify(record)).not.toContain('private prompt');
  });

  test('embedding usage exposes source, counts, dimensions, and error fields', () => {
    const record = buildEmbeddingUsageRecord({
      ok: true,
      config: { provider: 'cohere', model: 'embed-v4' },
      baseUrl: 'https://api.cohere.com/v2',
      endpoint: '/embed',
      payload: { texts: ['first', 'second'] },
      data: { embeddings: { float: [[0.1, 0.2, 0.3]] } },
      ms: 42,
      context: { source: 'memory-recall' },
    });

    expect(record).toMatchObject({
      type: 'embedding',
      ok: true,
      source: 'memory-recall',
      provider: 'cohere',
      model: 'embed-v4',
      baseUrl: 'https://api.cohere.com/v2',
      endpoint: '/embed',
      ms: 42,
      inputs: 2,
      dimensions: 3,
    });
  });

  test('image generation usage exposes prompt and result counts', () => {
    const record = buildImageGenerationUsageRecord({
      ok: true,
      config: { provider: 'google', model: 'gemini-image' },
      payload: { prompt: 'private image prompt' },
      data: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'base64-image' } }],
            },
          },
        ],
      },
      ms: 99,
      context: { source: 'image-route' },
    });

    expect(record).toMatchObject({
      type: 'image_generation',
      ok: true,
      source: 'image-route',
      provider: 'google',
      model: 'gemini-image',
      ms: 99,
      prompts: 1,
      candidates: 1,
      images: 1,
    });
    expect(JSON.stringify(record)).not.toContain('private image prompt');
  });

  test('maps safe records into normalized prompt-free event payloads', () => {
    const record = buildChatUsageRecord({
      ok: true,
      config: { provider: 'openrouter' },
      payload: {
        model: 'chat-model',
        messages: [{ role: 'user', content: 'private prompt' }],
      },
      data: {
        choices: [{ finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      },
      ms: 25,
      attempts: 2,
      context: { source: 'gateway-default' },
    });

    const payload = usageEventPayload(record, { source: 'chat-loop' });

    expect(payload).toEqual({
      usageType: 'chat_completion',
      ok: true,
      source: 'chat-loop',
      provider: 'openrouter',
      model: 'chat-model',
      ms: 25,
      attempts: 2,
      requestCount: 1,
      resultCount: 1,
      finishReason: 'stop',
      usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
    });
    expect(JSON.stringify(payload)).not.toContain('private prompt');
  });
});
