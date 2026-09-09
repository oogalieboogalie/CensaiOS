import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = {
  query: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
}));

const { default: express } = await import('express');
const { keysRouter } = await import('../server/routes/keys.js');
const { decryptKey } = await import('../server/security/vault.js');
const { inferUserApiKeyProvider } = await import('../server/security/userApiKeys.js');

function createApp(userId = 42) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = userId ? { userId } : {};
    next();
  });
  app.use('/api', keysRouter);
  return app;
}

describe('user API key routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  test('encrypts a supported provider key before storing it', async () => {
    const response = await request(createApp())
      .post('/api/keys')
      .send({
        provider: ' OpenRouter ',
        apiKey: '  secret-user-key  ',
        baseUrl: 'http://127.0.0.1:9999',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true, provider: 'openrouter' });

    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toBe(42);
    expect(params[1]).toBe('openrouter');
    expect(params[2]).not.toContain('secret-user-key');
    expect(decryptKey(params[2], 42)).toBe('secret-user-key');
    expect(params[3]).toBeNull();
  });

  test('lists key metadata without returning ciphertext', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        provider: 'google',
        base_url: null,
        model_name: 'gemini-2.5-pro',
        updated_at: '2026-06-17T12:00:00.000Z',
        api_key_encrypted: 'must-not-leak',
      }],
    });

    const response = await request(createApp()).get('/api/keys');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      provider: 'google',
      hasKey: true,
      baseUrl: null,
      modelName: 'gemini-2.5-pro',
      updatedAt: '2026-06-17T12:00:00.000Z',
    }]);
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });

  test('rejects unsupported providers and unauthenticated writes', async () => {
    const unsupported = await request(createApp())
      .post('/api/keys')
      .send({ provider: 'anthropic', apiKey: 'secret' });
    const unauthorized = await request(createApp(null))
      .post('/api/keys')
      .send({ provider: 'openrouter', apiKey: 'secret' });

    expect(unsupported.status).toBe(400);
    expect(unauthorized.status).toBe(401);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('rejects model overrides that exceed the database limit', async () => {
    const response = await request(createApp())
      .post('/api/keys')
      .send({
        provider: 'openrouter',
        apiKey: 'secret',
        modelName: 'm'.repeat(101),
      });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('normalizes provider aliases and known cloud endpoints', () => {
    expect(inferUserApiKeyProvider('cohere', 'https://api.cohere.ai/compatibility/v1')).toBe('cohere');
    expect(inferUserApiKeyProvider(null, 'https://api.cohere.ai/compatibility/v1')).toBe('cohere');
    expect(inferUserApiKeyProvider('google-native', 'google-native')).toBe('google');
    expect(inferUserApiKeyProvider('kimi', 'https://api.moonshot.cn/v1')).toBe('moonshot');
    expect(inferUserApiKeyProvider(null, 'https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferUserApiKeyProvider(null, 'https://api.openai.com/v1')).toBe('openai');
    expect(inferUserApiKeyProvider(null, 'http://localhost:11434/v1')).toBeNull();
  });
});
