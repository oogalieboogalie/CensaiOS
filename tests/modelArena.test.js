import { jest } from '@jest/globals';
import express from 'express';

// Model arena: one prompt to up to four models, streamed side by side with
// time to first word, total time, tokens and estimated cost. Real models
// are stood in for by local streaming servers (no keys in CI).

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), startTimer: jest.fn(() => () => 5) };
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));
const secrets = { GEMINI_API_KEY: 'server-gemini-key', ANTHROPIC_API_KEY: '' };
jest.unstable_mockModule('../server/secrets.js', () => ({
  PRODUCTION_REQUIRED_SECRETS: [],
  initSecrets: jest.fn(),
  requireSecret: jest.fn(() => 'secret'),
  optionalSecret: jest.fn((name, fallback = null) => fallback),
  requireProductionSecret: jest.fn(() => 'secret'),
  getSecret: jest.fn((key) => secrets[key] || ''),
}));
const personalKeys = new Map();
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (userId, provider) => personalKeys.get(`${userId}:${provider}`) || null),
  inferUserApiKeyProvider: (provider) => ({ anthropic: 'anthropic', google: 'google', openai: 'openai' }[provider] || null),
}));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => false }));

const { parseArenaRequest, laneConfig } = await import('../server/modelArena/runLane.js');
const { modelArenaRouter } = await import('../server/routes/modelArena.js');
const { startOpenAiStandin } = await import('./fixtures/openAiStandin.js');
const { startAnthropicStandin } = await import('./fixtures/anthropicStandin.js');
const catalog = await import('../src/lib/modelArena/arenaCatalog.js');
const { applyArenaEvent, emptyResult } = await import('../src/lib/modelArena/runArena.js');

let gemini;
let claude;
let server;
let base;

beforeAll(async () => {
  gemini = await startOpenAiStandin((body) => {
    if (body.model === 'broken-model') return { status: 404, error: 'model not found' };
    if (body.model === 'short-model') return { words: ['<!DOCTYPE html>', '\n<head>'], finishReason: 'length' };
    return { words: ['Edit ', 'src/lib/tax.js', ' line 2.'], delayMs: 5 };
  });
  claude = await startAnthropicStandin(() => ({ blocks: [{ type: 'text', text: 'src/lib/tax.js:2:24' }], usage: { input_tokens: 120, output_tokens: 9 } }));
  process.env.GEMINI_OPENAI_BASE_URL = gemini.baseUrl;
  process.env.ANTHROPIC_BASE_URL = claude.baseUrl;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = req.headers['x-user'] ? { userId: req.headers['x-user'] } : {}; next(); });
  app.use('/api/model-arena', modelArenaRouter);
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/model-arena`;
});

afterAll(async () => {
  delete process.env.GEMINI_OPENAI_BASE_URL;
  delete process.env.ANTHROPIC_BASE_URL;
  await Promise.all([gemini.close(), claude.close(), new Promise((r) => server.close(r))]);
});

async function race(body, user = 'u1') {
  const res = await fetch(`${base}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, events: res.ok ? text.trim().split('\n').map((l) => JSON.parse(l)) : JSON.parse(text) };
}

describe('request checks', () => {
  test('needs a prompt and one to four known models', () => {
    expect(parseArenaRequest({ prompt: ' ', models: [{ provider: 'google', model: 'x' }] }).error).toMatch(/request/);
    expect(parseArenaRequest({ prompt: 'hi', models: [] }).error).toMatch(/at least one/);
    expect(parseArenaRequest({ prompt: 'hi', models: Array(5).fill({ provider: 'google', model: 'x' }) }).error).toMatch(/at most 4/);
    expect(parseArenaRequest({ prompt: 'hi', models: [{ provider: 'nope', model: 'x' }] }).error).toMatch(/not one the arena knows/);
    expect(parseArenaRequest({ prompt: 'hi', models: [{ provider: 'Google', model: 'gemini-3.8-flash' }], maxTokens: 99999 }))
      .toEqual({ prompt: 'hi', system: '', lanes: [{ provider: 'google', model: 'gemini-3.8-flash' }], maxTokens: 32000 });
    // Thinking models spend budget before writing: the default leaves room for a whole page of code.
    expect(parseArenaRequest({ prompt: 'hi', models: [{ provider: 'google', model: 'x' }] }).maxTokens).toBe(8192);
  });

  test('a saved personal key wins and the picked model is kept', async () => {
    personalKeys.set('u9:anthropic', { apiKey: 'alex-claude-key', modelName: 'claude-opus-5-5' });
    const config = await laneConfig({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { userId: 'u9' });
    expect(config).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'alex-claude-key' });
    personalKeys.clear();
  });
});

describe('POST /api/model-arena/run', () => {
  test('signed-out and bad requests are refused before anything runs', async () => {
    expect((await race({ prompt: 'hi', models: [{ provider: 'google', model: 'gemini-3.8-flash' }] }, null)).res.status).toBe(401);
    expect((await race({ prompt: 'hi', models: [] })).res.status).toBe(400);
  });

  test('two models race: both stream, both report time, tokens and model', async () => {
    personalKeys.set('u1:anthropic', { apiKey: 'alex-claude-key', modelName: null });
    const { res, events } = await race({
      prompt: 'Where is the tax rate?',
      system: 'Be brief.',
      models: [{ provider: 'google', model: 'gemini-3.8-flash' }, { provider: 'anthropic', model: 'claude-haiku-5-5' }],
    });
    personalKeys.clear();
    expect(res.headers.get('content-type')).toMatch(/ndjson/);
    expect(events[0]).toEqual({ type: 'begin', lanes: 2 });
    expect(events.at(-1)).toEqual({ type: 'end' });
    const text = (lane) => events.filter((e) => e.type === 'delta' && e.lane === lane).map((e) => e.text).join('');
    expect(text(0)).toBe('Edit src/lib/tax.js line 2.');
    expect(text(1)).toBe('src/lib/tax.js:2:24');
    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(2);
    const [g, c] = [done.find((e) => e.lane === 0), done.find((e) => e.lane === 1)];
    expect(g).toMatchObject({ model: 'gemini-3.8-flash', usage: { estimated: true } });
    expect(c.usage).toEqual({ input: 120, output: 9, estimated: false });
    for (const e of done) {
      expect(e.firstTokenMs).toBeGreaterThanOrEqual(0);
      expect(e.totalMs).toBeGreaterThanOrEqual(e.firstTokenMs);
    }
    // Each provider got the picked model, the instructions and the right key.
    const sent = gemini.requests.at(-1);
    expect(sent.body).toMatchObject({ model: 'gemini-3.8-flash', stream: true, max_tokens: 8192 });
    expect(sent.body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' });
    expect(sent.headers.authorization).toBe('Bearer server-gemini-key');
    expect(claude.requests.at(-1).body.model).toBe('claude-haiku-5-5');
    expect(claude.requests.at(-1).headers['x-api-key']).toBe('alex-claude-key');
  });

  test('one model failing or missing a key leaves the others running', async () => {
    const { events } = await race({
      prompt: 'hi',
      models: [{ provider: 'google', model: 'broken-model' }, { provider: 'anthropic', model: 'claude-haiku-5-5' }, { provider: 'google', model: 'gemini-3.8-flash' }],
    });
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.map((e) => e.lane).sort()).toEqual([0, 1]);
    expect(errors.find((e) => e.lane === 1).error).toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: 'anthropic' });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ lane: 2 });
  });

  test('an answer that hits the length limit is reported as cut off', async () => {
    const { events } = await race({ prompt: 'design me a single html sign in form', models: [{ provider: 'google', model: 'short-model' }] });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ lane: 0, finishReason: 'length' });
  });
});

describe('the window\'s numbers', () => {
  test('cost comes from list prices; local and free models cost nothing', () => {
    expect(catalog.estimateCost('anthropic', 'claude-haiku-5-5', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(0.6);
    expect(catalog.estimateCost('google', 'gemini-3.8-flash', { input: 2000, output: 1000 })).toBeCloseTo(0.00525);
    expect(catalog.estimateCost('ollama', 'llama3.1:8b', { input: 10, output: 10 })).toBe(0);
    expect(catalog.estimateCost('opencode', 'big-pickle', { input: 1, output: 1 })).toBeNull();
    expect(catalog.formatCost(null)).toBe('no price on file');
    expect(catalog.formatMs(840)).toBe('840 ms');
    expect(catalog.formatMs(2300)).toBe('2.3 s');
    expect(catalog.tokensPerSecond({ usage: { output: 100 }, firstTokenMs: 500, totalMs: 1500 })).toBe(100);
  });

  test('the default race is Gemini 3.8 Flash against Haiku 5.5, and both are in the picker', () => {
    const ids = catalog.arenaModels().map((m) => m.id);
    for (const lane of catalog.DEFAULT_LANES) expect(ids).toContain(`${lane.provider}:${lane.model}`);
    expect(catalog.SAMPLE_TASKS.map((t) => t.id)).toEqual(['map', 'pinpoint', 'ripple', 'route']);
  });

  test('events fold into lanes, and badges go to the winners', () => {
    const lanes = catalog.DEFAULT_LANES;
    let results = lanes.map(emptyResult);
    results = applyArenaEvent(results, { type: 'delta', lane: 0, text: 'Hi' });
    results = applyArenaEvent(results, { type: 'delta', lane: 0, text: ' there' });
    results = applyArenaEvent(results, { type: 'done', lane: 0, firstTokenMs: 300, totalMs: 900, usage: { input: 100, output: 50 } });
    results = applyArenaEvent(results, { type: 'done', lane: 1, firstTokenMs: 200, totalMs: 1200, usage: { input: 100, output: 50 } });
    expect(results[0]).toMatchObject({ status: 'done', text: 'Hi there' });
    expect(applyArenaEvent(results, { type: 'delta', lane: 7, text: 'x' })).toBe(results);
    expect(catalog.laneBadges(lanes, results)).toEqual([['First to finish'], ['First to answer', 'Cheapest']]);
    const cut = applyArenaEvent(results, { type: 'done', lane: 0, firstTokenMs: 300, totalMs: 900, usage: { input: 100, output: 50 }, finishReason: 'length' });
    expect(catalog.laneBadges(lanes, cut)).toEqual([[], ['First to answer', 'Cheapest']]);
  });
});
