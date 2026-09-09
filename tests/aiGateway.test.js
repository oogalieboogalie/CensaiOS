import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const getSecret = jest.fn((key) => ({
  AI_API_KEY: 'fallback-key',
  COHERE_PAID_API_KEY: 'cohere-key',
  OPENROUTER_API_KEY: 'openrouter-key',
  MOONSHOT_API_KEY: 'moonshot-key',
}[key] || ''));
const getGeminiApiKey = jest.fn((fallback) => `gemini-key:${fallback}`);
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  startTimer: jest.fn(() => () => 7),
};

process.env.AI_MODEL = 'default-model';
process.env.AI_BASE_URL = 'http://default.test/v1/';
process.env.MOONSHOT_BASE_URL = 'https://moonshot.test/v1/';

jest.unstable_mockModule('../server/secrets.js', () => ({
  getSecret,
}));

jest.unstable_mockModule('../server/googleKeys.js', () => ({
  getGeminiApiKey,
}));

jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: jest.fn(() => logger),
}));

const {
  resolveChatModelConfig,
  requestChatCompletion,
} = await import('../server/aiGateway/index.js');

const originalFetch = global.fetch;

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
  jest.useRealTimers();
});

afterAll(() => {
  process.env = envSnapshot;
});

describe('AI Gateway chat model config', () => {
  test('resolves default and provider-specific chat completion settings', () => {
    expect(resolveChatModelConfig()).toMatchObject({
      provider: null,
      model: 'default-model',
      baseUrl: 'http://default.test/v1',
      apiKey: 'fallback-key',
    });
    expect(resolveChatModelConfig({ modelProvider: 'cohere', modelName: 'north-mini-code-1-0' })).toMatchObject({
      provider: 'cohere',
      model: 'north-mini-code-1-0',
      baseUrl: 'https://api.cohere.ai/compatibility/v1',
      apiKey: 'cohere-key',
    });
    expect(resolveChatModelConfig({ modelProvider: 'openrouter', modelName: 'or-model' })).toMatchObject({
      provider: 'openrouter',
      model: 'or-model',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-key',
    });
    expect(resolveChatModelConfig({ modelProvider: 'google', modelName: 'gemini-2.5-flash' })).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'gemini-key:fallback-key',
    });
    expect(resolveChatModelConfig({ modelProvider: 'ollama', modelName: 'gemma4:35b' })).toMatchObject({
      provider: 'ollama',
      model: 'gemma4:31b-cloud',
      baseUrl: 'http://default.test/v1',
      apiKey: 'ollama',
    });
    expect(resolveChatModelConfig({ modelProvider: 'kimi', modelName: 'kimi-k2' })).toMatchObject({
      provider: 'kimi',
      model: 'kimi-k2',
      baseUrl: 'https://moonshot.test/v1',
      apiKey: 'moonshot-key',
    });
  });
});

describe('AI Gateway chat completion request', () => {
  test('posts OpenAI-compatible chat completions and returns JSON', async () => {
    global.fetch = jest.fn(async (url, options) => {
      expect(url).toBe('http://gateway.test/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer gateway-key');
      expect(JSON.parse(options.body)).toMatchObject({ model: 'body-model' });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'done' } }] }),
      };
    });

    await expect(requestChatCompletion({
      config: {
        provider: 'test',
        model: 'config-model',
        baseUrl: 'http://gateway.test/v1/',
        apiKey: 'gateway-key',
      },
      body: { model: 'body-model', messages: [{ role: 'user', content: 'secret prompt' }] },
      timeoutMs: 1000,
    })).resolves.toEqual({ choices: [{ message: { content: 'done' } }] });
    expect(logger.info).toHaveBeenCalledWith('chat completion usage', expect.objectContaining({
      ok: true,
      model: 'body-model',
      messages: 1,
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret prompt');
  });

  test('captures non-retryable response text in thrown errors', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    }));

    await expect(requestChatCompletion({
      config: { baseUrl: 'http://gateway.test/v1', apiKey: 'gateway-key' },
      body: { model: 'body-model', messages: [] },
      timeoutMs: 1000,
    })).rejects.toThrow('400: bad request');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('chat completion usage', expect.objectContaining({
      ok: false,
      model: 'body-model',
      error: expect.objectContaining({ status: 400 }),
    }));
  });

  test('does not fall back to the default server key for Cohere', async () => {
    global.fetch = jest.fn();
    await expect(requestChatCompletion({
      config: {
        provider: 'cohere',
        model: 'north-mini-code-1-0',
        baseUrl: 'https://api.cohere.ai/compatibility/v1',
        apiKey: '',
      },
      body: { messages: [] },
    })).rejects.toThrow('Cohere API key is missing');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('uses Cohere strict tools without silently removing definitions', async () => {
    const tools = Array.from({ length: 50 }, (_, index) => ({
      type: 'function',
      function: {
        name: `tool_${index}`,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 5 }, (__, field) => [`field_${field}`, { type: 'string' }])
          ),
        },
      },
    }));
    global.fetch = jest.fn(async (url, options) => {
      const payload = JSON.parse(options.body);
      expect(payload.strict_tools).toBe(true);
      expect(payload.tools.length).toBe(50);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'strict' } }] }),
      };
    });

    await requestChatCompletion({
      config: {
        provider: 'cohere',
        model: 'north-mini-code-1-0',
        baseUrl: 'https://api.cohere.ai/compatibility/v1',
        apiKey: 'cohere-key',
      },
      body: { messages: [], tools },
    });
  });

  test('retries transient HTTP failures before returning JSON', async () => {
    const sleep = jest.fn(async () => {});
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'try again',
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'recovered' } }] }),
      });

    await expect(requestChatCompletion({
      config: { baseUrl: 'http://gateway.test/v1', apiKey: 'gateway-key' },
      body: { model: 'body-model', messages: [] },
      timeoutMs: 1000,
      retry: { maxRetries: 1, baseDelayMs: 0, sleep },
    })).resolves.toEqual({ choices: [{ message: { content: 'recovered' } }] });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('aborts requests that exceed the timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const request = requestChatCompletion({
      config: { baseUrl: 'http://gateway.test/v1', apiKey: 'gateway-key' },
      body: { model: 'body-model', messages: [] },
      timeoutMs: 25,
    });
    const expectation = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(25);

    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
