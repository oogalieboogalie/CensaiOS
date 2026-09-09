import { jest } from '@jest/globals';

const requestChatCompletion = jest.fn(async ({ usageSink, usageAttribution }) => {
  await usageSink?.({
    record: { type: 'chat_completion', ok: true },
    attribution: usageAttribution,
  });
  return { ok: true };
});
const requestEmbedding = jest.fn(async ({ usageSink, usageAttribution }) => {
  await usageSink?.({
    record: { type: 'embedding', ok: true },
    attribution: usageAttribution,
  });
  return { data: [{ embedding: [1, 2, 3] }] };
});
const requestImageGeneration = jest.fn(async ({ usageSink, usageAttribution }) => {
  await usageSink?.({
    record: { type: 'image_generation', ok: true },
    attribution: usageAttribution,
  });
  return { candidates: [] };
});
const resolveChatModelConfig = jest.fn(() => ({
  provider: 'openrouter',
  model: 'resolved-model',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'key',
}));
const resolveEmbeddingModelConfig = jest.fn(() => ({
  provider: 'openai-compatible',
  model: 'resolved-embedding',
  baseUrl: 'http://embeddings.test/v1',
  endpoint: '/embeddings',
  apiKey: 'key',
}));
const resolveImageGenerationModelConfig = jest.fn(() => ({
  provider: 'google',
  model: 'resolved-image-model',
  apiKey: 'key',
}));

jest.unstable_mockModule('../server/aiGateway/chatCompletion.js', () => ({
  requestChatCompletion,
}));

jest.unstable_mockModule('../server/aiGateway/embedding.js', () => ({
  EMBEDDING_MODEL_KIND: 'embedding',
  requestEmbedding,
}));

jest.unstable_mockModule('../server/aiGateway/providers.js', () => ({
  resolveChatModelConfig,
}));

jest.unstable_mockModule('../server/aiGateway/embeddingProviders.js', () => ({
  resolveEmbeddingModelConfig,
}));

jest.unstable_mockModule('../server/aiGateway/imageGeneration.js', () => ({
  IMAGE_GENERATION_MODEL_KIND: 'image.generation',
  requestImageGeneration,
}));

jest.unstable_mockModule('../server/aiGateway/imageProviders.js', () => ({
  resolveImageGenerationModelConfig,
}));

const {
  CHAT_COMPLETION_MODEL_KIND,
  EMBEDDING_MODEL_KIND,
  IMAGE_GENERATION_MODEL_KIND,
  callModel,
} = await import('../server/aiGateway/callModel.js');

beforeEach(() => {
  jest.clearAllMocks();
  requestChatCompletion.mockImplementation(async ({ usageSink, usageAttribution }) => {
    await usageSink?.({ record: { type: 'chat_completion', ok: true }, attribution: usageAttribution });
    return { ok: true };
  });
  requestEmbedding.mockImplementation(async ({ usageSink, usageAttribution }) => {
    await usageSink?.({ record: { type: 'embedding', ok: true }, attribution: usageAttribution });
    return { data: [{ embedding: [1, 2, 3] }] };
  });
  requestImageGeneration.mockImplementation(async ({ usageSink, usageAttribution }) => {
    await usageSink?.({ record: { type: 'image_generation', ok: true }, attribution: usageAttribution });
    return { candidates: [] };
  });
});

describe('AI Gateway callModel API', () => {
  test('routes chat-completion calls through the low-level requester', async () => {
    await expect(callModel({
      kind: CHAT_COMPLETION_MODEL_KIND,
      modelProvider: 'openrouter',
      modelName: 'explicit-model',
      body: { messages: [] },
      timeoutMs: 1000,
      logContext: { source: 'test' },
      retry: { maxRetries: 0 },
    })).resolves.toEqual({ ok: true });

    expect(resolveChatModelConfig).toHaveBeenCalledWith({
      modelProvider: 'openrouter',
      modelName: 'explicit-model',
    });
    expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ model: 'resolved-model' }),
      body: { messages: [] },
      timeoutMs: 1000,
      logContext: { source: 'test' },
      retry: { maxRetries: 0 },
    }));
  });

  test('uses body.model when no explicit modelName is supplied', async () => {
    await callModel({ modelProvider: 'google', body: { model: 'gemini', messages: [] } });

    expect(resolveChatModelConfig).toHaveBeenCalledWith({
      modelProvider: 'google',
      modelName: 'gemini',
    });
  });

  test('routes embedding calls through the low-level requester', async () => {
    await expect(callModel({
      kind: EMBEDDING_MODEL_KIND,
      modelProvider: 'ollama',
      body: { model: 'nomic-embed-text', input: 'text' },
      logContext: { source: 'test' },
    })).resolves.toEqual({ data: [{ embedding: [1, 2, 3] }] });

    expect(resolveEmbeddingModelConfig).toHaveBeenCalledWith({
      modelProvider: 'ollama',
      modelName: 'nomic-embed-text',
    });
    expect(requestEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ model: 'resolved-embedding' }),
      body: { model: 'nomic-embed-text', input: 'text' },
      logContext: { source: 'test' },
    }));
  });

  test('routes image generation calls through the low-level requester', async () => {
    await expect(callModel({
      kind: IMAGE_GENERATION_MODEL_KIND,
      modelProvider: 'google',
      body: { model: 'gemini-image', prompt: 'draw' },
      logContext: { source: 'test' },
    })).resolves.toEqual({ candidates: [] });

    expect(resolveImageGenerationModelConfig).toHaveBeenCalledWith({
      modelProvider: 'google',
      modelName: 'gemini-image',
    });
    expect(requestImageGeneration).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ model: 'resolved-image-model' }),
      body: { model: 'gemini-image', prompt: 'draw' },
      logContext: { source: 'test' },
    }));
  });

  test('rejects unsupported model call kinds', async () => {
    await expect(callModel({
      kind: 'image',
      body: { input: 'text' },
    })).rejects.toThrow('Unsupported model call kind: image');
    expect(requestChatCompletion).not.toHaveBeenCalled();
  });

  test('passes one safe usage sink contract through every model kind', async () => {
    const usageSink = jest.fn();
    const usageAttribution = {
      workspaceId: 'workspace-1',
      actor: { kind: 'user', id: 'local-user' },
      source: 'test',
    };

    await callModel({ body: { messages: [] }, usageSink, usageAttribution });
    await callModel({ kind: EMBEDDING_MODEL_KIND, body: { input: 'text' }, usageSink, usageAttribution });
    await callModel({ kind: IMAGE_GENERATION_MODEL_KIND, body: { prompt: 'draw' }, usageSink, usageAttribution });

    expect(usageSink.mock.calls.map(([input]) => input.record.type)).toEqual([
      'chat_completion',
      'embedding',
      'image_generation',
    ]);
    expect(usageSink).toHaveBeenCalledWith(expect.objectContaining({
      attribution: usageAttribution,
    }));
  });

  test('sink failures do not change model success or model error behavior', async () => {
    const sinkError = new Error('ledger unavailable');
    const usageSink = jest.fn(async () => {
      throw sinkError;
    });

    await expect(callModel({
      body: { messages: [] },
      usageSink,
      usageAttribution: { workspaceId: 'workspace-1', source: 'test' },
    })).resolves.toEqual({ ok: true });

    const modelError = new Error('provider unavailable');
    requestChatCompletion.mockImplementationOnce(async ({ usageSink: safeSink, usageAttribution }) => {
      await safeSink?.({ record: { type: 'chat_completion', ok: false }, attribution: usageAttribution });
      throw modelError;
    });

    await expect(callModel({
      body: { messages: [] },
      usageSink,
      usageAttribution: { workspaceId: 'workspace-1', source: 'test' },
    })).rejects.toBe(modelError);
  });
});
