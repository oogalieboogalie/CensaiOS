import { jest } from '@jest/globals';

// The key saved in Settings (the vault) wins over an older key in the setup
// file (.env) for every model call made for a person through callModel:
// Idea Pad expand, agent icons, design remix, agent wake-ups, module making,
// task workers and LeadHound's writing step. Made-up keys only.

const OLD_KEYS = {
  GEMINI_API_KEY: 'made-up-old-gemini-key',
  ANTHROPIC_API_KEY: 'sk-ant-api03-made-up-old-key',
  OPENAI_API_KEY: 'sk-made-up-old-openai-key',
  XAI_API_KEY: 'xai-made-up-old-key',
};
const SAVED = {
  google: 'made-up-saved-gemini-key',
  anthropic: 'sk-ant-api03-made-up-saved-key',
  openai: 'sk-made-up-saved-openai-key',
  xai: 'xai-made-up-saved-key',
};

const getUserApiKeyConfig = jest.fn();
const requestChatCompletion = jest.fn(async () => ({ choices: [{ message: { content: 'ok' } }] }));
const dbQuery = jest.fn(async () => ({ rows: [{ role: 'admin' }] }));

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: dbQuery } }));
jest.unstable_mockModule('../server/aiGateway/chatCompletion.js', () => ({ requestChatCompletion }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn((provider) => (provider === 'google-native' ? 'google' : provider)),
}));

const { callModel } = await import('../server/aiGateway/callModel.js');
const { createModelAccessContext } = await import('../server/aiGateway/modelAccess.js');
const { useSavedKey } = await import('../server/aiGateway/savedKey.js');

const saved = {};
beforeAll(() => {
  for (const name of ['CENSAI_MODE', 'AI_API_KEY', ...Object.keys(OLD_KEYS)]) saved[name] = process.env[name];
});
afterAll(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'local_desktop';
  delete process.env.AI_API_KEY;
  Object.assign(process.env, OLD_KEYS);
  getUserApiKeyConfig.mockImplementation(async (_userId, provider) => (
    SAVED[provider] ? { apiKey: SAVED[provider], modelName: null } : null
  ));
});

const SURFACES = ['idea-expand', 'agent-icons', 'design-remix', 'agent-wakeup', 'module-generate', 'task-worker', 'leadhound'];

function sentKey() {
  return requestChatCompletion.mock.calls.at(-1)[0].config.apiKey;
}

async function call(provider, source, userId = '1') {
  await callModel({
    modelProvider: provider,
    modelName: 'made-up-model',
    body: { messages: [{ role: 'user', content: 'hi' }] },
    accessContext: createModelAccessContext({ userId, workspaceId: 'w1', source }),
  });
  return sentKey();
}

describe('every callModel surface sends the key saved in Settings', () => {
  for (const source of SURFACES) {
    test(`${source} uses the saved key, not the setup file one`, async () => {
      for (const provider of ['google', 'anthropic', 'openai', 'xai']) {
        expect(await call(provider, source)).toBe(SAVED[provider]);
      }
      expect(getUserApiKeyConfig).toHaveBeenCalledWith('1', 'google');
    });
  }

  test('with nothing saved, the owner keeps the setup file key', async () => {
    getUserApiKeyConfig.mockResolvedValue(null);
    expect(await call('google', 'idea-expand')).toBe(OLD_KEYS.GEMINI_API_KEY);
  });

  test('a vault entry that only borrowed the setup file key is not a saved key', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'made-up-other', modelName: null, source: 'env' });
    expect(await call('anthropic', 'idea-expand')).toBe(OLD_KEYS.ANTHROPIC_API_KEY);
  });

  test('a failed vault read falls back to the setup file key', async () => {
    getUserApiKeyConfig.mockRejectedValue(new Error('db down'));
    expect(await call('openai', 'design-remix')).toBe(OLD_KEYS.OPENAI_API_KEY);
  });

  test('a call made for nobody in particular keeps the setup file key', async () => {
    await callModel({ modelProvider: 'google', modelName: 'm', body: { messages: [] } });
    expect(sentKey()).toBe(OLD_KEYS.GEMINI_API_KEY);
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
  });
});

describe('useSavedKey leaves keys a caller chose alone', () => {
  test('a key that is not the setup file one is never replaced', async () => {
    const config = { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-made-up-lane-key' };
    expect(await useSavedKey(config, '1')).toBe(config);
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
  });

  test('a model on this computer needs no key', async () => {
    const config = { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama' };
    expect(await useSavedKey(config, '1')).toBe(config);
  });

  test('an empty key is filled from the vault', async () => {
    const config = { provider: 'xai', baseUrl: 'https://api.x.ai/v1', apiKey: '' };
    expect((await useSavedKey(config, '1')).apiKey).toBe(SAVED.xai);
  });
});
