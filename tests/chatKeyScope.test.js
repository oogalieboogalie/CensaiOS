import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// On a local install the AI keys in .env are the owner's. A teammate who
// signs in (Open anywhere, a share link) chats and runs agents on their own
// key and is asked for one when they have none, unless the owner turns on
// Settings, AI keys, "Share my AI keys with" for them. The owner is unaffected.

const OWNER_KEY = 'sk-ant-api03-owner-env-key';
const getAgent = jest.fn();
const getUserApiKeyConfig = jest.fn(async () => null);
const resolveChatModelConfig = jest.fn();
const dbQuery = jest.fn();
const requestChatCompletion = jest.fn(async () => ({ choices: [{ message: { content: 'hi' } }] }));

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces.js', () => ({ openProject: jest.fn() }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent,
  getSubAgentById: jest.fn().mockResolvedValue(null),
  buildSystemPrompt: jest.fn().mockResolvedValue('agent prompt'),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  resolveChatModelConfig,
  ModelAccessError: class ModelAccessError extends Error {},
}));
jest.unstable_mockModule('../server/aiGateway/chatCompletion.js', () => ({ requestChatCompletion }));
jest.unstable_mockModule('../server/tools.js', () => ({ filterToolsForAgent: jest.fn().mockResolvedValue([]) }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: dbQuery } }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn((provider) => (provider === 'ollama' ? null : provider)),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({ buildSubAgentSystemPrompt: jest.fn() }));

const { prepareChatContext } = await import('../server/routes/chat/chatContext.js');
const { callModel, createModelAccessContext } = await import('../server/aiGateway/callModel.js')
  .then(async (mod) => ({ ...mod, ...(await import('../server/aiGateway/modelAccess.js')) }));
const { mayUseServerKeys, scopeServerKey } = await import('../server/security/serverKeys.js');
const { resetKeySharingCache, setKeySharing } = await import('../server/security/keySharing.js');
const { keySharingRouter } = await import('../server/routes/keySharing.js');
const express = (await import('express')).default;
const request = (await import('supertest')).default;

const ROLES = { owner: 'admin', sam: 'user', kid: 'user' };
const saved = {};
let stateDir;

beforeAll(() => {
  for (const name of ['CENSAI_MODE', 'ANTHROPIC_API_KEY', 'HOMEBASE_STATE_DIR']) saved[name] = process.env[name];
});

beforeEach(() => {
  jest.clearAllMocks();
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-sharing-'));
  process.env.HOMEBASE_STATE_DIR = stateDir;
  process.env.CENSAI_MODE = 'local_desktop';
  process.env.ANTHROPIC_API_KEY = OWNER_KEY;
  resetKeySharingCache();
  getUserApiKeyConfig.mockResolvedValue(null);
  dbQuery.mockImplementation(async (sql, params = []) => {
    if (/SELECT role FROM users/.test(sql)) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (/SELECT id FROM users WHERE id/.test(sql)) return { rows: ROLES[params[0]] ? [{ id: params[0] }] : [] };
    if (/SELECT id, name, email, role FROM users/.test(sql)) {
      return { rows: Object.entries(ROLES).map(([id, role]) => ({ id, name: id, email: `${id}@home`, role })) };
    }
    return { rows: [] };
  });
  resolveChatModelConfig.mockReturnValue({
    provider: 'anthropic', model: 'claude-sonnet', baseUrl: 'https://api.anthropic.com/v1', apiKey: OWNER_KEY,
  });
  getAgent.mockResolvedValue({ id: 'atlas', model_provider: 'anthropic', model_name: 'claude-sonnet' });
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

afterAll(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  resetKeySharingCache();
});

const chat = (userId, userRole) => prepareChatContext('atlas', null, [{ from: 'me', text: 'hello' }], userId, userRole);

describe('chat on a local install', () => {
  test('the owner still chats on the .env keys', async () => {
    const context = await chat('owner', 'admin');
    expect(context.reqApiKey).toBe(OWNER_KEY);
  });

  test('a teammate cannot use the owner keys by default and is asked for their own', async () => {
    await expect(chat('sam', 'user')).rejects.toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: 'anthropic', statusCode: 400 });
  });

  test("a teammate's own saved key is used", async () => {
    getUserApiKeyConfig.mockImplementation(async (userId) => (userId === 'sam' ? { apiKey: 'sams-own-key' } : null));
    const context = await chat('sam', 'user');
    expect(context.reqApiKey).toBe('sams-own-key');
  });

  test('with sharing on for them, a teammate chats on the owner keys', async () => {
    setKeySharing('sam', true);
    expect((await chat('sam', 'user')).reqApiKey).toBe(OWNER_KEY);
    await expect(chat('kid', 'user')).rejects.toMatchObject({ code: 'MODEL_KEY_MISSING' });
  });

  test('turning sharing back off closes it again', async () => {
    setKeySharing('sam', true);
    setKeySharing('sam', false);
    await expect(chat('sam', 'user')).rejects.toMatchObject({ code: 'MODEL_KEY_MISSING' });
  });

  test('a model running on this computer (Ollama) needs no key and always works', async () => {
    resolveChatModelConfig.mockReturnValue({ provider: 'ollama', model: 'llama', baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama' });
    getAgent.mockResolvedValue({ id: 'atlas', model_provider: 'ollama', model_name: 'llama' });
    const context = await chat('sam', 'user');
    expect(context.reqApiKey).toBe('ollama');
  });
});

describe('agents and workflows a teammate starts', () => {
  const run = (userId) => callModel({
    config: { provider: 'anthropic', model: 'claude-sonnet', baseUrl: 'https://api.anthropic.com/v1', apiKey: OWNER_KEY },
    body: { messages: [{ role: 'user', content: 'go' }] },
    accessContext: createModelAccessContext({ userId, workspaceId: 'ws', source: 'agent-run' }),
  });

  test('the owner runs on the .env keys', async () => {
    await run('owner');
    expect(requestChatCompletion.mock.calls[0][0].config.apiKey).toBe(OWNER_KEY);
  });

  test('a teammate never sends the owner key out', async () => {
    await expect(run('sam')).rejects.toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: 'anthropic' });
    expect(requestChatCompletion).not.toHaveBeenCalled();
  });

  test("a teammate's own key is swapped in", async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'sams-own-key' });
    await run('sam');
    expect(requestChatCompletion.mock.calls[0][0].config.apiKey).toBe('sams-own-key');
  });

  test('with sharing on, a teammate runs on the owner keys', async () => {
    setKeySharing('sam', true);
    await run('sam');
    expect(requestChatCompletion.mock.calls[0][0].config.apiKey).toBe(OWNER_KEY);
  });
});

describe('the rule itself', () => {
  test('a failed role lookup stays closed', async () => {
    dbQuery.mockRejectedValueOnce(new Error('db down'));
    expect(await mayUseServerKeys({ userId: 'sam' })).toBe(false);
  });

  test('sharing only applies on a local install', async () => {
    setKeySharing('sam', true);
    expect(await mayUseServerKeys({ userId: 'sam', userRole: 'user' }, { mode: 'cloud_saas' })).toBe(false);
  });

  test('cloud and private-server installs keep their own rules', async () => {
    const config = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: OWNER_KEY };
    await expect(scopeServerKey(config, { userId: 'sam', userRole: 'user' }, { mode: 'private_server' })).resolves.toBe(config);
    await expect(scopeServerKey(config, { userId: 'sam', userRole: 'user' }, { mode: 'cloud_saas' })).resolves.toBe(config);
  });
});

describe('Settings, AI keys, "Share my AI keys with"', () => {
  function app(session) {
    const server = express();
    server.use(express.json());
    server.use((req, _res, next) => { req.session = session; next(); });
    server.use('/api/key-sharing', keySharingRouter);
    return server;
  }
  const owner = { userId: 'owner', userRole: 'admin' };

  test('the owner sees everyone else, all off by default', async () => {
    const res = await request(app(owner)).get('/api/key-sharing');
    expect(res.status).toBe(200);
    expect(res.body.canManage).toBe(true);
    expect(res.body.accounts.map((a) => [a.id, a.shared])).toEqual([['sam', false], ['kid', false]]);
  });

  test('the owner turns sharing on for one person', async () => {
    const res = await request(app(owner)).put('/api/key-sharing/sam').send({ shared: true });
    expect(res.status).toBe(200);
    expect(res.body.accounts.find((a) => a.id === 'sam').shared).toBe(true);
    expect(await mayUseServerKeys({ userId: 'sam', userRole: 'user' })).toBe(true);
    expect(await mayUseServerKeys({ userId: 'kid', userRole: 'user' })).toBe(false);
  });

  test('a teammate cannot turn sharing on for themselves', async () => {
    const res = await request(app({ userId: 'sam', userRole: 'user' })).put('/api/key-sharing/sam').send({ shared: true });
    expect(res.status).toBe(403);
    expect(await mayUseServerKeys({ userId: 'sam', userRole: 'user' })).toBe(false);
  });

  test('a teammate only learns whether keys are shared with them', async () => {
    const res = await request(app({ userId: 'sam', userRole: 'user' })).get('/api/key-sharing');
    expect(res.body).toEqual({ available: true, canManage: false, accounts: [], sharedWithMe: false });
  });

  test('an account that is not on this computer is refused', async () => {
    const res = await request(app(owner)).put('/api/key-sharing/stranger').send({ shared: true });
    expect(res.status).toBe(404);
  });
});
