import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const mockPool = { query: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory/core/agents.js', () => ({
  getAgents: async () => [
    { id: 'atlas', name: 'Atlas', model_provider: 'anthropic', model_name: 'claude-sonnet-5' },
    { id: 'nexus', name: 'Nexus', model_provider: 'openai', model_name: 'gpt-4.1' },
    { id: 'echo', name: 'Echo', model_provider: 'ollama', model_name: 'llama3' },
    { id: 'censai', name: 'Censai', model_provider: null, model_name: null },
  ],
}));

const { default: express } = await import('express');
const { encryptKey } = await import('../server/security/vault.js');
const { keyIdentity, maskedKey } = await import('../server/aiResources/keyIdentity.js');
const { estimateCost, priceFor } = await import('../server/aiResources/prices.js');
const ledger = await import('../server/aiResources/ledger.js');
const { meterModelCall, consumerOf } = await import('../server/aiResources/meter.js');
const { buildAiResources } = await import('../server/aiResources/summary.js');
const { readProviderBalance } = await import('../server/aiResources/providerBalance.js');
const { aiResourcesRouter } = await import('../server/routes/aiResources.js');

// Made-up keys, never real ones.
const ALMA_KEY = 'sk-ant-api03-FAKE-alma-0000-TEST1234';
const SAM_KEY = 'sk-or-v1-FAKE-sam-0000-TEST9876';
let dir;

function dbWith({ users = [{ id: 1, name: 'Pat Example', role: 'admin' }, { id: 2, name: 'Sam Sample', role: 'member' }] } = {}) {
  mockPool.query.mockImplementation(async (sql, params = []) => {
    if (/FROM user_api_keys/.test(sql)) {
      if (Number(params[0]) === 1) return { rows: [{ provider: 'anthropic', api_key_encrypted: encryptKey(ALMA_KEY, 1), model_name: null, updated_at: null }] };
      if (Number(params[0]) === 2) return { rows: [{ provider: 'openrouter', api_key_encrypted: encryptKey(SAM_KEY, 2), model_name: null, updated_at: null }] };
      return { rows: [] };
    }
    if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: users.find((u) => u.id === Number(params[0]))?.role || null }] };
    if (/FROM users/.test(sql)) return { rows: users };
    return { rows: [] };
  });
}

function app(userId, userRole) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId, userRole }; next(); });
  server.use('/api/ai-resources', aiResourcesRouter);
  return server;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-'));
  process.env.HOMEBASE_STATE_DIR = dir;
  process.env.CENSAI_ENV_KEYS = 'off';
  ledger.resetLedgerForTests();
  dbWith();
});

afterEach(() => {
  ledger.resetLedgerForTests();
  delete process.env.HOMEBASE_STATE_DIR;
  delete process.env.CENSAI_ENV_KEYS;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('keys are known by fingerprint and last four only', () => {
  test('the identity never carries the key', () => {
    const id = keyIdentity('anthropic', ALMA_KEY);
    expect(id.last4).toBe('1234');
    expect(id.id).toMatch(/^anthropic:[0-9a-f]{16}$/);
    expect(JSON.stringify(id)).not.toContain('FAKE');
    expect(maskedKey(id.last4)).toBe('••••1234');
    expect(keyIdentity('openai', '')).toBeNull();
  });
});

describe('estimated prices', () => {
  test('known models price by the longest matching name, local models are free, unknown ones are null', () => {
    expect(priceFor('claude-opus-5-5')).toEqual([4, 20]);
    expect(priceFor('anthropic/claude-sonnet-4-5-20250929')).toEqual([3, 15]);
    expect(priceFor('gpt-4o-mini-2024-07-18')).toEqual([0.15, 0.6]);
    expect(priceFor('o3-mini')).toEqual([1.1, 4.4]);
    expect(priceFor('gpt-5-pro')).toBeNull();
    expect(priceFor('o3-pro-2025-06-10')).toBeNull();
    expect(priceFor('gemini-2.5-pro')).toEqual([1.25, 10]);
    expect(estimateCost({ provider: 'anthropic', model: 'claude-opus-5-5', tokensIn: 1_000_000, tokensOut: 100_000 })).toBeCloseTo(6);
    expect(estimateCost({ provider: 'ollama', model: 'llama3', tokensIn: 5000 })).toBe(0);
    expect(estimateCost({ provider: 'mystery', model: 'brand-new-model', tokensIn: 5 })).toBeNull();
  });
});

describe('the meter', () => {
  test('a chat window call lands on its key, under the window and the person', () => {
    meterModelCall({
      config: { provider: 'anthropic', apiKey: ALMA_KEY, model: 'claude-opus-5-5' },
      result: { usage: { prompt_tokens: 1000, completion_tokens: 500 } },
      attribution: { actor: { id: 1 }, source: 'chat-loop', agentId: 'atlas', windowId: 'w1' },
    });
    const entry = ledger.ledgerKey(keyIdentity('anthropic', ALMA_KEY).id);
    expect(entry.totals).toMatchObject({ calls: 1, tokensIn: 1000, tokensOut: 500 });
    expect(entry.totals.costUsd).toBeCloseTo(0.014);
    expect(Object.values(entry.consumers)[0]).toMatchObject({ kind: 'window', ref: 'w1', agentId: 'atlas', userId: '1' });
    ledger.flushLedger();
    expect(fs.readFileSync(path.join(dir, 'ai-resources.json'), 'utf8')).not.toContain('FAKE');
  });

  test('a call with no key is not metered, and a broken record never throws', () => {
    meterModelCall({ config: { provider: 'openai' }, result: {} });
    expect(ledger.ledgerKeys()).toEqual({});
    expect(() => meterModelCall({ config: null, result: null })).not.toThrow();
    meterModelCall({ config: { provider: null, apiKey: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3' }, result: { usage: { prompt_tokens: 10 } } });
    expect(ledger.ledgerKey('ollama:local').totals).toMatchObject({ calls: 1, costUsd: 0 });
  });

  test('a damaged ledger file is kept aside, never overwritten', () => {
    fs.writeFileSync(path.join(dir, 'ai-resources.json'), '{"keys": {broken');
    ledger.resetLedgerForTests();
    expect(ledger.ledgerKeys()).toEqual({});
    expect(fs.readdirSync(dir).some((f) => f.startsWith('ai-resources.json.damaged-'))).toBe(true);
  });

  test('agents and features get their own rows', () => {
    expect(consumerOf({ actor: { id: 3 }, agentId: 'nexus', source: 'task-worker' })).toMatchObject({ kind: 'agent', ref: 'nexus' });
    expect(consumerOf({ actor: { id: 3 }, source: 'leadhound' })).toMatchObject({ kind: 'feature', ref: 'leadhound' });
  });
});

describe('what each person sees', () => {
  function spend(userId, apiKey, provider, model, attribution) {
    meterModelCall({ config: { provider, apiKey, model }, result: { usage: { prompt_tokens: 2000, completion_tokens: 1000 } }, attribution: { actor: { id: userId }, ...attribution } });
  }

  test('a member sees their own key, their own use of a shared key, never the owner\'s key ending', async () => {
    spend(1, ALMA_KEY, 'anthropic', 'claude-opus-5-5', { source: 'chat-loop', windowId: 'w1' });
    spend(2, ALMA_KEY, 'anthropic', 'claude-opus-5-5', { source: 'group-chat', agentId: 'atlas' });
    spend(2, SAM_KEY, 'openrouter', 'anthropic/claude-sonnet-5', { source: 'leadhound' });
    const view = await buildAiResources({ userId: 2, userRole: 'member', deps: { cliResources: async () => [], agentDefaults: async () => ({ fallback: null, defaultLocal: true }) } });
    expect(view.owner).toBe(false);
    const mine = view.keys.find((k) => k.mine);
    expect(mine).toMatchObject({ provider: 'openrouter', masked: '••••9876', source: 'vault', canAskProvider: true });
    const shared = view.keys.find((k) => !k.mine);
    expect(shared.masked).toBe('••••');
    expect(shared.keyId).not.toMatch(/^anthropic:/);
    expect(shared.calls).toBe(1);
    expect(shared.users.every((u) => u.who === 'Sam Sample')).toBe(true);
    expect(JSON.stringify(view)).not.toContain('FAKE');
  });

  test('the owner sees everyone who spent on their key, and which key each agent uses', async () => {
    spend(1, ALMA_KEY, 'anthropic', 'claude-opus-5-5', { source: 'chat-loop', windowId: 'w1' });
    spend(2, ALMA_KEY, 'anthropic', 'claude-opus-5-5', { source: 'group-chat', agentId: 'atlas' });
    const view = await buildAiResources({ userId: 1, userRole: 'admin', deps: { cliResources: async () => [], agentDefaults: async () => ({ fallback: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, defaultLocal: true }) } });
    const card = view.keys.find((k) => k.mine);
    expect(card.calls).toBe(2);
    expect(card.users.map((u) => u.who).sort()).toEqual(['Pat Example', 'Sam Sample']);
    const routes = Object.fromEntries(view.agents.map((a) => [a.id, a.route]));
    expect(routes).toMatchObject({ atlas: 'vault', echo: 'local' });
    expect(view.agents.find((a) => a.id === 'atlas').keyId).toBe(card.keyId);
    // Left on the default model while Ollama is off, it borrows the owner's Anthropic key, as the chat does.
    expect(view.agents.find((a) => a.id === 'censai')).toMatchObject({ route: 'vault', borrowed: true, model: 'claude-sonnet-5-5', keyId: card.keyId });
  });
});

describe('routes', () => {
  test('a starting amount counts down from what is spent after it was typed', async () => {
    const keyId = keyIdentity('anthropic', ALMA_KEY).id;
    meterModelCall({ config: { provider: 'anthropic', apiKey: ALMA_KEY, model: 'claude-opus-5-5' }, result: { usage: { prompt_tokens: 1_000_000 } }, attribution: { actor: { id: 1 } } });
    await request(app(1, 'admin')).put('/api/ai-resources/budget').send({ keyId, budgetUsd: 20 }).expect(200);
    meterModelCall({ config: { provider: 'anthropic', apiKey: ALMA_KEY, model: 'claude-opus-5-5' }, result: { usage: { prompt_tokens: 250_000 } }, attribution: { actor: { id: 1 } } });
    const res = await request(app(1, 'admin')).get('/api/ai-resources').expect(200);
    const card = res.body.keys.find((k) => k.keyId === keyId);
    expect(card.budgetUsd).toBe(20);
    expect(card.leftUsd).toBeCloseTo(19);
  });

  test('nobody sets an amount on a key that is not theirs, and nonsense amounts are refused', async () => {
    const almaKeyId = keyIdentity('anthropic', ALMA_KEY).id;
    await request(app(2, 'member')).put('/api/ai-resources/budget').send({ keyId: almaKeyId, budgetUsd: 5 }).expect(404);
    await request(app(1, 'admin')).put('/api/ai-resources/budget').send({ keyId: almaKeyId, budgetUsd: -3 }).expect(400);
    await request(app(1, 'admin')).put('/api/ai-resources/budget').send({ keyId: almaKeyId, budgetUsd: 'lots' }).expect(400);
  });

  test('signed out gets nothing', async () => {
    await request(app(null)).get('/api/ai-resources').expect(401);
  });
});

describe('asking the provider', () => {
  // A stand-in name lookup: the provider's hosts answer a public address.
  const resolve = async () => [{ address: '104.18.2.115', family: 4 }];
  test('OpenRouter credits come back as the provider\'s number', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ data: { total_credits: 50, total_usage: 12.5 } }) }));
    await expect(readProviderBalance('openrouter', 'sk-or-v1-FAKE', { fetchImpl, resolve })).resolves.toMatchObject({ total: 50, used: 12.5, left: 37.5 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/credits');
  });

  test('a refused key and a provider with no balance answer say so in plain words', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401 }));
    await expect(readProviderBalance('moonshot', 'sk-FAKE', { fetchImpl, resolve })).rejects.toThrow('did not accept this key');
    await expect(readProviderBalance('anthropic', 'sk-FAKE')).rejects.toThrow('does not tell apps');
  });
});
