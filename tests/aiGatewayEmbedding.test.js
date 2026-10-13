import { jest } from '@jest/globals';

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  startTimer: jest.fn(() => () => 11),
};

jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: jest.fn(() => logger),
}));

const {
  requestEmbedding,
} = await import('../server/aiGateway/embedding.js');

const originalFetch = global.fetch;

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

describe('AI Gateway embedding request', () => {
  test('posts OpenAI-compatible embeddings and returns JSON without logging input text', async () => {
    global.fetch = jest.fn(async (url, options) => {
      expect(url).toBe('http://embeddings.test/v1/embeddings');
      expect(options.headers.Authorization).toBe('Bearer embed-key');
      expect(JSON.parse(options.body)).toEqual({ model: 'nomic-embed-text', input: 'private text' });
      return {
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      };
    });

    await expect(requestEmbedding({
      config: {
        provider: 'openai-compatible',
        model: 'nomic-embed-text',
        baseUrl: 'http://embeddings.test/v1',
        endpoint: '/embeddings',
        apiKey: 'embed-key',
      },
      body: { input: 'private text' },
    })).resolves.toEqual({ data: [{ embedding: [0.1, 0.2] }] });

    expect(logger.info).toHaveBeenCalledWith('embedding usage', expect.objectContaining({
      ok: true,
      model: 'nomic-embed-text',
      inputs: 1,
      dimensions: 2,
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('private text');
  });

  test('posts Cohere embeddings with provider headers', async () => {
    global.fetch = jest.fn(async (url, options) => {
      expect(url).toBe('https://api.cohere.com/v2/embed');
      expect(options.headers['X-Client-Name']).toBe('homebase');
      return {
        ok: true,
        json: async () => ({ embeddings: { float: [[0.1, 0.2, 0.3]] } }),
      };
    });

    await expect(requestEmbedding({
      config: {
        provider: 'cohere',
        model: 'embed-v4.0',
        baseUrl: 'https://api.cohere.com',
        endpoint: '/v2/embed',
        apiKey: 'cohere-key',
        headers: { 'X-Client-Name': 'homebase' },
      },
      body: { texts: ['private text'], input_type: 'search_document' },
    })).resolves.toEqual({ embeddings: { float: [[0.1, 0.2, 0.3]] } });
  });

  test('throws typed errors for provider failures', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'missing model',
    }));

    await expect(requestEmbedding({
      config: { baseUrl: 'http://embeddings.test/v1', endpoint: '/embeddings', apiKey: 'key' },
      body: { model: 'missing', input: 'text' },
    })).rejects.toMatchObject({
      name: 'EmbeddingHttpError',
      status: 404,
      body: 'missing model',
    });
  });

  test('records network failures without logging input text', async () => {
    global.fetch = jest.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { name: 'TypeError' });
    });

    await expect(requestEmbedding({
      config: { baseUrl: 'http://embeddings.test/v1', endpoint: '/embeddings', apiKey: 'key' },
      body: { model: 'nomic-embed-text', input: 'private text' },
    })).rejects.toThrow('fetch failed');

    expect(logger.error).toHaveBeenCalledWith('embedding usage', expect.objectContaining({
      ok: false,
      model: 'nomic-embed-text',
      error: expect.objectContaining({ name: 'TypeError' }),
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private text');
  });
});
