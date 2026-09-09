import { jest } from '@jest/globals';

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  startTimer: jest.fn(() => () => 17),
};
const generateContent = jest.fn();
const generateImages = jest.fn();
const GoogleGenAI = jest.fn(() => ({
  models: { generateContent, generateImages },
}));

jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: jest.fn(() => logger),
}));

jest.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI,
}));

const {
  requestImageGeneration,
} = await import('../server/aiGateway/imageGeneration.js');

afterEach(() => {
  jest.clearAllMocks();
});

describe('AI Gateway image generation request', () => {
  test('calls Gemini image generation and records safe usage', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
    });

    await expect(requestImageGeneration({
      config: { provider: 'google', model: 'gemini-image', apiKey: 'gemini-key' },
      body: { prompt: 'private prompt text' },
    })).resolves.toEqual({
      candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
    });

    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'gemini-key' });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-image',
      contents: 'private prompt text',
    });
    expect(logger.info).toHaveBeenCalledWith('image generation usage', expect.objectContaining({
      ok: true,
      provider: 'google',
      model: 'gemini-image',
      prompts: 1,
      candidates: 1,
      images: 1,
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('private prompt text');
  });

  test('calls Imagen generation for imagen model ids', async () => {
    generateImages.mockResolvedValue({
      generatedImages: [{ image: { imageBytes: 'def', mimeType: 'image/png' } }],
    });

    await expect(requestImageGeneration({
      config: { provider: 'google', model: 'imagen-4.0-generate-001', apiKey: 'gemini-key' },
      body: { prompt: 'private prompt text' },
    })).resolves.toEqual({
      generatedImages: [{ image: { imageBytes: 'def', mimeType: 'image/png' } }],
    });

    expect(generateImages).toHaveBeenCalledWith({
      model: 'imagen-4.0-generate-001',
      prompt: 'private prompt text',
      config: { numberOfImages: 1, includeRaiReason: true },
    });
    expect(generateContent).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('image generation usage', expect.objectContaining({
      ok: true,
      model: 'imagen-4.0-generate-001',
      prompts: 1,
      images: 1,
    }));
  });

  test('records provider failures without logging prompt text', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('provider failed'), { name: 'ProviderError' }));

    await expect(requestImageGeneration({
      config: { provider: 'google', model: 'gemini-image', apiKey: 'gemini-key' },
      body: { prompt: 'private prompt text' },
    })).rejects.toThrow('provider failed');

    expect(logger.error).toHaveBeenCalledWith('image generation usage', expect.objectContaining({
      ok: false,
      model: 'gemini-image',
      error: expect.objectContaining({ name: 'ProviderError' }),
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private prompt text');
  });
});
