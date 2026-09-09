import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const getSecret = jest.fn((key) => ({
  AI_API_KEY: 'fallback-key',
  COHERE_PAID_API_KEY: 'cohere-key',
  OPENROUTER_API_KEY: 'openrouter-key',
  MOONSHOT_API_KEY: 'moonshot-key',
  OPENCODE_API_KEY: 'zen-key',
}[key] || ''));
const getGeminiApiKey = jest.fn((fallback) => `gemini-key:${fallback}`);

process.env.AI_MODEL = 'default-model';
process.env.AI_BASE_URL = 'http://default.test/v1/';
process.env.MOONSHOT_BASE_URL = 'https://moonshot.test/v1/';

jest.unstable_mockModule('../server/secrets.js', () => ({
  getSecret,
}));

jest.unstable_mockModule('../server/googleKeys.js', () => ({
  getGeminiApiKey,
}));

const {
  normalizeProviderName,
  resolveChatModelConfig,
} = await import('../server/aiGateway/providers.js');

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = envSnapshot;
});

describe('AI Gateway provider adapters', () => {
  test('normalizes provider names without inventing a provider', () => {
    expect(normalizeProviderName(' OpenRouter ')).toBe('openrouter');
    expect(normalizeProviderName('')).toBeNull();
    expect(normalizeProviderName(undefined)).toBeNull();
  });

  test('resolves default provider settings', () => {
    expect(resolveChatModelConfig()).toMatchObject({
      provider: null,
      model: 'default-model',
      baseUrl: 'http://default.test/v1',
      apiKey: 'fallback-key',
    });
  });

  test('resolves named provider adapters', () => {
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
    expect(resolveChatModelConfig({ modelProvider: 'opencode', modelName: 'muse-spark-1.3-contributor-free' })).toMatchObject({
      provider: 'opencode',
      model: 'muse-spark-1.3-contributor-free',
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: 'zen-key',
    });
  });
});
