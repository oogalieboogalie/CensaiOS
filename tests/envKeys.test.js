import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = { query: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));

const { default: express } = await import('express');
const {
  envKeyFor, envKeyProviders, envKeysEnabled, ownerEnvKeyConfig, ownerEnvKeyProviders,
} = await import('../server/security/envKeys.js');
const { keysRouter } = await import('../server/routes/keys.js');
const { getUserApiKeyConfig } = await import('../server/security/userApiKeys.js');
const { borrowKeyedModel } = await import('../server/routes/chat/keyFallback.js');

const LOCAL = { mode: 'local_desktop' };
const ENV_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'TAVILY_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'CENSAI_ENV_KEYS', 'CENSAI_MODE', 'HOMEBASE_MODE'];
let saved;

function dbWith({ role = 'admin', vaultRows = [] } = {}) {
  mockPool.query.mockImplementation(async (sql) => {
    if (/FROM users/.test(sql)) return { rows: role ? [{ role }] : [] };
    if (/FROM user_api_keys/.test(sql)) return { rows: vaultRows };
    return { rows: [] };
  });
}

function app(userId = 7) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId }; next(); });
  server.use('/api', keysRouter);
  return server;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  process.env.CENSAI_MODE = 'local_desktop';
  jest.clearAllMocks();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('keys from the .env file', () => {
  test('reads the usual names and the common aliases', () => {
    const env = { CLAUDE_API_KEY: 'sk-ant-api03-a', KIMI_API_KEY: 'sk-k', GEMINI_API_KEY: '  AIza-g  ' };
    expect(envKeyFor('anthropic', env)).toBe('sk-ant-api03-a');
    expect(envKeyFor('moonshot', env)).toBe('sk-k');
    expect(envKeyFor('google', env)).toBe('AIza-g');
    expect(envKeyFor('openai', env)).toBeNull();
    expect(envKeyProviders(env).sort()).toEqual(['anthropic', 'google', 'moonshot']);
  });

  test('never uses a Claude subscription token or a placeholder', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-oat01-secret', OPENAI_API_KEY: 'ollama', XAI_API_KEY: '<your key>' };
    expect(envKeyFor('anthropic', env)).toBeNull();
    expect(envKeyProviders(env)).toEqual([]);
  });

  test('only on a local install, and CENSAI_ENV_KEYS=off turns it off', () => {
    expect(envKeysEnabled({ env: {}, ...LOCAL })).toBe(true);
    expect(envKeysEnabled({ env: {}, mode: 'cloud_saas' })).toBe(false);
    expect(envKeysEnabled({ env: {}, mode: 'private_server' })).toBe(false);
    expect(envKeysEnabled({ env: { CENSAI_ENV_KEYS: 'off' }, ...LOCAL })).toBe(false);
  });

  test('the owner gets the key; a teammate does not', async () => {
    const env = { OPENAI_API_KEY: 'sk-openai' };
    dbWith({ role: 'admin' });
    expect(await ownerEnvKeyConfig(mockPool, 1, 'openai', { env, ...LOCAL }))
      .toEqual({ apiKey: 'sk-openai', modelName: null, source: 'env' });
    dbWith({ role: 'user' });
    expect(await ownerEnvKeyConfig(mockPool, 2, 'openai', { env, ...LOCAL })).toBeNull();
    expect(await ownerEnvKeyProviders(mockPool, 2, { env, ...LOCAL })).toEqual([]);
    dbWith({ role: 'admin' });
    expect(await ownerEnvKeyConfig(mockPool, 1, 'openai', { env, mode: 'cloud_saas' })).toBeNull();
  });

  test('a saved vault key wins; with none, the owner falls back to .env', async () => {
    process.env.TAVILY_API_KEY = 'tvly-from-env';
    dbWith({ role: 'admin' });
    expect(await getUserApiKeyConfig(1, 'tavily')).toEqual({ apiKey: 'tvly-from-env', modelName: null, source: 'env' });
    dbWith({ role: 'user' });
    expect(await getUserApiKeyConfig(2, 'tavily')).toBeNull();
  });

  test('the key vault lists .env providers for the owner without the key itself', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-owner';
    process.env.OPENAI_API_KEY = 'sk-openai-owner';
    dbWith({ role: 'admin', vaultRows: [{ provider: 'openai', base_url: null, model_name: null, updated_at: null }] });
    const res = await request(app()).get('/api/keys');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'openai', source: 'vault' }),
      { provider: 'anthropic', hasKey: true, source: 'env' },
    ]));
    expect(res.body.filter((k) => k.provider === 'openai')).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/owner/);
  });

  test('a teammate sees only their own saved keys', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-owner';
    dbWith({ role: 'user' });
    const res = await request(app(9)).get('/api/keys');
    expect(res.body).toEqual([]);
  });

  test('a chat whose local model is off borrows the owner\'s .env key instead of asking', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-owner';
    const local = 'http://localhost:11434/v1';
    dbWith({ role: 'admin' });
    expect(await borrowKeyedModel({ userId: 1, baseUrl: local, reachable: async () => false }))
      .toMatchObject({ provider: 'anthropic', apiKey: 'sk-ant-api03-owner' });
    dbWith({ role: 'user' });
    expect(await borrowKeyedModel({ userId: 2, baseUrl: local, reachable: async () => false })).toBeNull();
  });
});
