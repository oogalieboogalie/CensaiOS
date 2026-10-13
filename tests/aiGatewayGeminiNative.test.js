import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const getSecret = jest.fn((key) => ({
  AI_API_KEY: 'fallback-key',
}[key] || ''));
const getGeminiApiKey = jest.fn((fallback) => `gemini-key:${fallback}`);
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  startTimer: jest.fn(() => () => 13),
};
const generateContent = jest.fn();
const GoogleGenAI = jest.fn(() => ({
  models: { generateContent },
}));

process.env.AI_MODEL = 'default-model';
process.env.AI_BASE_URL = 'http://default.test/v1/';

jest.unstable_mockModule('../server/secrets.js', () => ({
  getSecret,
}));

jest.unstable_mockModule('../server/googleKeys.js', () => ({
  getGeminiApiKey,
}));

jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: jest.fn(() => logger),
}));

jest.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI,
}));

const {
  resolveChatModelConfig,
  requestChatCompletion,
} = await import('../server/aiGateway/index.js');

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = envSnapshot;
});

describe('AI Gateway native Gemini chat adapter', () => {
  test('resolves google-native chat config with Gemini key fallback', () => {
    expect(resolveChatModelConfig({
      modelProvider: 'google-native',
      modelName: 'gemini-2.5-flash',
    })).toMatchObject({
      provider: 'google-native',
      model: 'gemini-2.5-flash',
      baseUrl: 'google-native',
      apiKey: 'gemini-key:fallback-key',
    });
  });

  test('formats chat messages for native Gemini and returns OpenAI-like output', async () => {
    generateContent.mockResolvedValue({
      text: 'native answer',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
      },
    });

    await expect(requestChatCompletion({
      config: {
        provider: 'google-native',
        model: 'gemini-2.5-flash',
        apiKey: 'gemini-key',
      },
      body: {
        messages: [
          { role: 'system', content: 'Use concise answers.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
        ],
      },
      timeoutMs: 1000,
    })).resolves.toMatchObject({
      object: 'chat.completion',
      model: 'gemini-2.5-flash',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'native answer' },
        finish_reason: 'STOP',
      }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      },
    });

    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'gemini-key' });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
        { role: 'user', parts: [{ text: 'Continue' }] },
      ],
      config: {
        systemInstruction: 'Use concise answers.',
      },
    });
    expect(logger.info).toHaveBeenCalledWith('chat completion usage', expect.objectContaining({
      ok: true,
      provider: 'google-native',
      model: 'gemini-2.5-flash',
      messages: 4,
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Hello');
  });
});
