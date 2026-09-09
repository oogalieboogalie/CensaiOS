import { jest } from '@jest/globals';

const callModel = jest.fn();
const resolveEmbeddingModelConfig = jest.fn();

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  EMBEDDING_MODEL_KIND: 'embedding',
  resolveEmbeddingModelConfig,
}));

const {
  embed,
  embeddingsAvailable,
  resetAvailability,
} = await import('../server/embeddings.js');

beforeEach(() => {
  jest.clearAllMocks();
  resetAvailability();
  delete process.env.COHERE_EMBEDDING_DIMENSION;
});

describe('server embeddings gateway integration', () => {
  test('routes OpenAI-compatible embeddings through callModel', async () => {
    resolveEmbeddingModelConfig.mockReturnValue({
      provider: 'openai-compatible',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434/v1',
      endpoint: '/embeddings',
      apiKey: 'ollama',
    });
    callModel.mockResolvedValue({ data: [{ embedding: [1, 2, 3] }] });

    await expect(embed('hello')).resolves.toEqual([1, 2, 3]);
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'embedding',
      body: { model: 'nomic-embed-text', input: 'hello' },
      logContext: { source: 'semantic-embedding' },
    }));
  });

  test('routes Cohere embeddings through callModel with input type', async () => {
    resolveEmbeddingModelConfig.mockReturnValue({
      provider: 'cohere',
      model: 'embed-v4.0',
      baseUrl: 'https://api.cohere.com',
      endpoint: '/v2/embed',
      apiKey: 'cohere-key',
    });
    callModel.mockResolvedValue({ embeddings: { float: [[0.1, 0.2]] } });

    await expect(embed('hello', { inputType: 'search_query' })).resolves.toEqual([0.1, 0.2]);
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'embedding',
      body: expect.objectContaining({
        model: 'embed-v4.0',
        texts: ['hello'],
        input_type: 'search_query',
      }),
      logContext: { source: 'semantic-embedding', inputType: 'search_query' },
    }));
  });

  test('disables embeddings after OpenAI-compatible 404', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveEmbeddingModelConfig.mockReturnValue({
      provider: 'openai-compatible',
      model: 'missing-model',
      baseUrl: 'http://localhost:11434/v1',
      endpoint: '/embeddings',
      apiKey: 'ollama',
    });
    callModel.mockRejectedValue(Object.assign(new Error('404: missing'), {
      status: 404,
      body: 'missing',
    }));

    await expect(embed('hello')).resolves.toBeNull();
    expect(embeddingsAvailable()).toBe(false);
    await expect(embed('again')).resolves.toBeNull();
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});
