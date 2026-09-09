import { jest } from '@jest/globals';

const callModel = jest.fn();
const resolveImageGenerationModelConfig = jest.fn(() => ({
  provider: 'google',
  model: 'gemini-image',
  apiKey: 'gemini-key',
}));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: jest.fn(),
  EMBEDDING_MODEL_KIND: 'embedding',
  IMAGE_GENERATION_MODEL_KIND: 'image.generation',
  resolveEmbeddingModelConfig: jest.fn(),
  resolveImageGenerationModelConfig,
  resolveChatModelConfig: jest.fn(),
  workspaceUsageSink: jest.fn(),
}));

const {
  handleImageGen,
} = await import('../server/routes/chat/handlers.js');

beforeEach(() => {
  jest.clearAllMocks();
});

function mockResponse() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe('image route gateway integration', () => {
  test('returns 400 when prompt is missing', async () => {
    const res = mockResponse();

    await handleImageGen({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing prompt' });
    expect(callModel).not.toHaveBeenCalled();
  });

  test('routes image generation through callModel and preserves response shape', async () => {
    callModel.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/webp' } }] } }],
    });
    const res = mockResponse();

    await handleImageGen({ body: { prompt: 'draw a launch screen' } }, res);

    expect(resolveImageGenerationModelConfig).toHaveBeenCalledWith({ modelProvider: 'google' });
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'image.generation',
      config: expect.objectContaining({ model: 'gemini-image' }),
      body: {
        model: 'gemini-image',
        prompt: 'draw a launch screen',
      },
      logContext: { source: 'image-generation' },
    }));
    expect(res.json).toHaveBeenCalledWith({ image: 'data:image/webp;base64,abc' });
  });
});
