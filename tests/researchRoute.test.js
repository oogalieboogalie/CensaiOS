import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();
const getUserApiKeyConfig = jest.fn();
const store = { sources: [], chunks: [] };

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (ctx) => ctx,
  workspaceUsageSink: null,
  EMBEDDING_MODEL_KIND: 'embedding',
  resolveEmbeddingModelConfig: () => ({ provider: 'openai-compatible', model: 'nomic-embed-text' }),
}));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({ getUserApiKeyConfig }));
jest.unstable_mockModule('../server/routes/agents/shared.js', () => ({ requireDb: (_req, _res, next) => next() }));
jest.unstable_mockModule('../server/routes/agents/scope.js', () => ({
  resolveAgentRouteScope: async (req) => ({ userId: req.session.userId, workspaceId: 'ws-1' }),
  agentRouteError: (res, err) => res.status(err.statusCode || 500).json({ error: err.message, code: err.code }),
}));
jest.unstable_mockModule('../server/research/store.js', () => ({
  saveSource: async (scope, src) => {
    const row = { id: `s${store.sources.length + 1}`, url: src.url, title: src.title, chunkCount: src.chunks.length, embedModel: src.embedModel };
    store.sources = [row, ...store.sources.filter((s) => s.url !== src.url)];
    src.chunks.forEach((c) => store.chunks.push({ text: c.text, embedding: c.embedding, embedModel: c.embedding ? src.embedModel : null, url: src.url, title: src.title }));
    return row;
  },
  listSources: async () => store.sources,
  deleteSource: async (_ws, id) => {
    const before = store.sources.length;
    store.sources = store.sources.filter((s) => s.id !== id);
    return store.sources.length < before;
  },
  loadChunks: async () => store.chunks,
}));

const { researchRouter } = await import('../server/routes/agents/research.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api', researchRouter);
  return a;
}

const tavilyFetch = () => jest.fn(async (url, opts) => {
  const body = JSON.parse(opts.body);
  if (url.endsWith('/search')) {
    return { ok: true, json: async () => ({ answer: body.include_answer ? 'Acme is in Austin.' : undefined, results: [{ url: 'https://acme.example', title: 'Acme', content: 'Acme HQ is Austin, Texas', published_date: '2026-09-01' }] }) };
  }
  return { ok: true, json: async () => ({ results: body.urls.map((u) => ({ url: u, raw_content: `Full page for ${u}. Acme was founded in Austin in 2019.` })) }) };
});

describe('Research routes', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TAVILY_API_KEY;
    // A local .env with a server embedder would otherwise replace the keyword fallback.
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_BASE_URL;
    store.sources = [];
    store.chunks = [];
  });
  afterAll(() => { global.fetch = realFetch; });

  test('status reports the Tavily key and the embedding choice without leaking keys', async () => {
    getUserApiKeyConfig.mockImplementation(async (_id, provider) => (provider === 'tavily' || provider === 'cohere' ? { apiKey: `key-${provider}` } : null));
    const res = await request(app()).get('/api/research/status');
    expect(res.body).toEqual({ tavily: { configured: true, source: 'byok' }, embedding: { model: 'cohere:embed-v4.0', label: 'Cohere embed-v4.0 (your key)' } });
    expect(JSON.stringify(res.body)).not.toContain('key-');
  });

  test('search without any Tavily key is a clear 424', async () => {
    getUserApiKeyConfig.mockResolvedValue(null);
    const res = await request(app()).post('/api/research/search').send({ query: 'acme' });
    expect(res.status).toBe(424);
    expect(res.body.code).toBe('TAVILY_KEY_REQUIRED');
    expect(res.body.error).toBe('Add a Tavily API key to search with Tavily.');
  });

  test('search, save to the board, list, ask with citations, delete', async () => {
    getUserApiKeyConfig.mockImplementation(async (_id, provider) => (provider === 'tavily' ? { apiKey: 'tvly-user' } : null));
    global.fetch = tavilyFetch();
    const search = await request(app()).post('/api/research/search').send({ query: 'acme hq', depth: 'advanced' });
    expect(search.status).toBe(200);
    expect(search.body.answer).toBe('Acme is in Austin.');
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ query: 'acme hq', search_depth: 'advanced', include_answer: 'advanced' });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tvly-user');

    const saved = await request(app()).post('/api/research/kb/save').send({ query: 'acme hq', results: search.body.results });
    expect(saved.status).toBe(200);
    expect(saved.body.embedder).toBe('Keyword ranking (BM25, no key needed)');
    expect(saved.body.sources).toHaveLength(1);
    expect(store.chunks[0].text).toContain('Full page for https://acme.example');

    const list = await request(app()).get('/api/research/kb');
    expect(list.body.sources[0].title).toBe('Acme');

    const query = await request(app()).post('/api/research/kb/query').send({ query: 'when was Acme founded', asPrompt: true });
    expect(query.body.hits[0].url).toBe('https://acme.example');
    expect(query.body.prompt).toContain('[BOARD KNOWLEDGE]');
    expect(query.body.sources).toEqual([{ n: 1, title: 'Acme', url: 'https://acme.example' }]);

    callModel.mockResolvedValueOnce({ choices: [{ message: { content: 'Founded in 2019 in Austin [1].' } }] });
    const ask = await request(app()).post('/api/research/ask').send({ question: 'when was Acme founded?' });
    expect(ask.body).toMatchObject({ ok: true, answer: 'Founded in 2019 in Austin [1].', usedWeb: false });

    const del = await request(app()).delete(`/api/research/kb/${saved.body.sources[0].id}`);
    expect(del.body).toEqual({ ok: true, sources: [] });
  });

  test('fill returns one cell with its source', async () => {
    getUserApiKeyConfig.mockImplementation(async (_id, provider) => (provider === 'tavily' ? { apiKey: 'tvly-user' } : null));
    global.fetch = tavilyFetch();
    callModel.mockResolvedValueOnce({ choices: [{ message: { content: '{"value":"Austin, TX","source":1}' } }] });
    const res = await request(app()).post('/api/research/fill').send({ value: 'Acme', prompt: 'HQ city' });
    expect(res.body).toEqual({ ok: true, value: 'Austin, TX', status: 'done', sourceUrl: 'https://acme.example', sourceTitle: 'Acme' });
  });
});

describe('Research recipe route', () => {
  test('unknown recipes are refused; references run with the user key', async () => {
    getUserApiKeyConfig.mockImplementation(async (_id, provider) => (provider === 'tavily' ? { apiKey: 'tvly-user' } : null));
    global.fetch = tavilyFetch();
    const bad = await request(app()).post('/api/research/recipe').send({ recipe: 'nope', input: 'x' });
    expect(bad.status).toBe(400);
    callModel.mockResolvedValueOnce({ choices: [{ message: { content: '{"refs":[{"n":1,"author":"Acme Labs","year":"2026","title":"Acme","summary":"About Acme.","citable":true}]}' } }] });
    const res = await request(app()).post('/api/research/recipe').send({ recipe: 'references', input: 'acme' });
    expect(res.body).toMatchObject({ ok: true, recipe: 'references', refs: [expect.objectContaining({ author: 'Acme Labs', year: '2026' })], saved: 1 });
  });
});
