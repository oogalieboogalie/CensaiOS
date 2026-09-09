import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const getGeminiApiKey = jest.fn(() => 'gemini-key');

delete process.env.IMAGE_PROVIDER;
delete process.env.IMAGE_MODEL;

jest.unstable_mockModule('../server/googleKeys.js', () => ({
  getGeminiApiKey,
}));

const {
  resolveImageGenerationModelConfig,
} = await import('../server/aiGateway/imageProviders.js');

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.IMAGE_PROVIDER;
  delete process.env.IMAGE_MODEL;
});

afterAll(() => {
  process.env = envSnapshot;
});

describe('AI Gateway image provider config', () => {
  test('resolves Gemini image defaults', () => {
    expect(resolveImageGenerationModelConfig()).toEqual({
      provider: 'google',
      model: 'gemini-3.1-flash-image-preview',
      apiKey: 'gemini-key',
    });
  });

  test('honors explicit image model settings', () => {
    process.env.IMAGE_MODEL = 'gemini-custom-image';

    expect(resolveImageGenerationModelConfig({ modelProvider: 'google' })).toEqual({
      provider: 'google',
      model: 'gemini-custom-image',
      apiKey: 'gemini-key',
    });
  });
});
