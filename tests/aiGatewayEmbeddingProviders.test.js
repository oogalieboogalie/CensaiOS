import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const getSecret = jest.fn((key) => ({
  AI_API_KEY: 'ai-key',
  COHERE_NON_COMMERCIAL_KEY: 'cohere-key',
}[key] || ''));

process.env.AI_BASE_URL = 'http://ollama.test/v1/';
process.env.COHERE_BASE_URL = 'https://cohere.test/';
delete process.env.EMBEDDING_PROVIDER;
delete process.env.EMBEDDING_MODEL;
delete process.env.EMBEDDING_BASE_URL;

jest.unstable_mockModule('../server/secrets.js', () => ({ getSecret }));

const {
  resolveEmbeddingModelConfig,
} = await import('../server/aiGateway/embeddingProviders.js');

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_BASE_URL;
});

afterAll(() => {
  process.env = envSnapshot;
});

describe('AI Gateway embedding provider config', () => {
  test('resolves OpenAI-compatible defaults', () => {
    expect(resolveEmbeddingModelConfig()).toMatchObject({
      provider: 'openai-compatible',
      model: 'nomic-embed-text',
      baseUrl: 'http://ollama.test/v1',
      endpoint: '/embeddings',
      apiKey: 'ai-key',
    });
  });

  test('resolves explicit Cohere provider config', () => {
    process.env.EMBEDDING_PROVIDER = 'cohere';

    expect(resolveEmbeddingModelConfig()).toMatchObject({
      provider: 'cohere',
      model: 'embed-v4.0',
      baseUrl: 'https://cohere.test',
      endpoint: '/v2/embed',
      apiKey: 'cohere-key',
      headers: { 'X-Client-Name': 'homebase' },
    });
  });

  test('infers Cohere when an embed-* model and key are configured', () => {
    expect(resolveEmbeddingModelConfig({ modelName: 'embed-english-v3.0' })).toMatchObject({
      provider: 'cohere',
      model: 'embed-english-v3.0',
      endpoint: '/v2/embed',
    });
  });
});
