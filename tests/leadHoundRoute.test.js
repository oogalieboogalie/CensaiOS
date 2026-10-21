import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();
const getUserApiKeyConfig = jest.fn();
const saveLead = jest.fn();

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (ctx) => ctx,
  workspaceUsageSink: null,
}));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({ getUserApiKeyConfig }));
jest.unstable_mockModule('../server/salesLeads/store.js', () => ({ saveLead }));
jest.unstable_mockModule('../server/routes/agents/shared.js', () => ({ requireDb: (_req, _res, next) => next() }));
jest.unstable_mockModule('../server/routes/agents/scope.js', () => ({
  resolveAgentRouteScope: async (req) => ({ userId: req.session.userId, workspaceId: 'ws-1' }),
  agentRouteError: (res, err) => res.status(err.statusCode || 500).json({ error: err.message, code: err.code }),
}));

const { leadHoundRouter } = await import('../server/routes/agents/leadhound.js');
const { createTavilyClient, resolveTavilyKey } = await import('../server/leadhound/tavily.js');
const { STANDIN_BRIEF, standinComplete, startStandinTavily } = await import('./fixtures/leadHoundStandin.js');

const readText = (res, cb) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => cb(null, data));
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api', leadHoundRouter);
  return a;
}

const reply = (content) => ({ choices: [{ message: { content } }] });

describe('LeadHound routes', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TAVILY_API_KEY;
  });
  afterAll(() => { global.fetch = realFetch; });

  test('status prefers the user BYOK key and never returns it', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'tvly-user' });
    const res = await request(app()).get('/api/leadhound/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tavily: { configured: true, source: 'byok' } });
    expect(JSON.stringify(res.body)).not.toContain('tvly-user');
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'tavily');
  });

  test('run without any Tavily key is a clear 424', async () => {
    getUserApiKeyConfig.mockResolvedValue(null);
    const res = await request(app()).post('/api/leadhound/run').send({ business: 'a', market: 'b' });
    expect(res.status).toBe(424);
    expect(res.body.code).toBe('TAVILY_KEY_REQUIRED');
  });

  test('run hunts with the user key and the gateway model, end to end', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'tvly-user' });
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () => (url.endsWith('/search')
        ? { results: [{ title: 'Acme Plumbing', url: 'https://acmeplumbing.example', content: 'Family plumbing', score: 0.8 }] }
        : { results: [{ raw_content: 'Write to owner@acmeplumbing.example' }] }),
    }));
    callModel
      .mockResolvedValueOnce(reply('{"queries":["plumbers Denver"]}'))
      .mockResolvedValueOnce(reply('{"leads":[{"index":0,"company":"Acme Plumbing","fit_score":88}]}'))
      .mockResolvedValueOnce(reply(JSON.stringify({
        sequence: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, channel: 'email', body: `t${i + 1}` })),
        ice_breaker: { title: 'Acme teardown', deliverable: '# Ideas' },
      })));

    const res = await request(app()).post('/api/leadhound/run').send({ business: 'Scheduling software', market: 'plumbers', maxLeads: 1 });
    expect(res.status).toBe(200);
    expect(res.body.leads[0]).toMatchObject({ company: 'Acme Plumbing', fitScore: 88 });
    expect(res.body.leads[0].sequence).toHaveLength(7);
    expect(res.body.leads[0].contacts.emails).toEqual(['owner@acmeplumbing.example']);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tvly-user');
    expect(callModel.mock.calls[0][0].accessContext).toMatchObject({ userId: 7, workspaceId: 'ws-1', source: 'leadhound' });
  });

  test('streams real progress then the result, against a stand-in Tavily over HTTP', async () => {
    global.fetch = realFetch;
    const tavily = await startStandinTavily();
    process.env.TAVILY_API_BASE = tavily.url;
    try {
      getUserApiKeyConfig.mockResolvedValue({ apiKey: 'tvly-user' });
      callModel.mockImplementation(async ({ body }) => reply(standinComplete(body.messages)));

      const res = await request(app())
        .post('/api/leadhound/run')
        .set('Accept', 'application/x-ndjson')
        .send(STANDIN_BRIEF)
        .buffer(true)
        .parse(readText);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/x-ndjson');
      const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
      const steps = lines.filter((l) => l.type === 'step');
      expect(steps.map((s) => s.step)).toEqual(['plan', 'search', 'score', 'enrich', 'draft', 'draft', 'draft', 'draft']);
      expect(steps[1].queries).toHaveLength(3);
      expect(steps[2].found).toBe(6);
      expect(steps[3].shortlist.map((l) => l.company)).toEqual(['Barton Creek Family Dental', 'Mueller Smiles', 'Eastside Dental Studio']);
      expect(steps.at(-1)).toMatchObject({ drafted: 3, total: 3 });

      const result = lines.at(-1);
      expect(result.type).toBe('result');
      expect(result.leads).toHaveLength(3);
      expect(result.leads[0].sequence).toHaveLength(7);
      expect(result.leads[0].iceBreaker.title).toBe('Missed-call snapshot for Barton Creek Family Dental');
      expect(result.leads[0].contacts.emails).toEqual(['frontdesk@barton-creek-family-dental.example']);
      expect(result.candidates.at(-1).company).toBe('Dental vendor roundup');
      expect(tavily.calls.filter((c) => c.path === '/search')).toHaveLength(3);
      expect(tavily.calls.every((c) => c.auth === 'Bearer tvly-user')).toBe(true);
    } finally {
      delete process.env.TAVILY_API_BASE;
      callModel.mockReset();
      await tavily.close();
    }
  });

  test('a failure after the stream starts arrives as an error line', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'tvly-user' });
    callModel.mockResolvedValue(reply('{"queries":["x"]}'));
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const res = await request(app())
      .post('/api/leadhound/run')
      .set('Accept', 'application/x-ndjson')
      .send({ business: 'a', market: 'b' })
      .buffer(true)
      .parse(readText);
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.at(-1)).toMatchObject({ type: 'error', code: 'TAVILY_REQUEST_FAILED' });
  });

  test('a brief without a market is a 400 before anything streams', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'tvly-user' });
    const res = await request(app()).post('/api/leadhound/run').set('Accept', 'application/x-ndjson').send({ business: 'a' });
    expect(res.status).toBe(400);
  });

  test('save banks a hunted lead in the Lead Queue', async () => {
    saveLead.mockResolvedValue({ id: 42, deduped: false });
    const res = await request(app()).post('/api/leadhound/save').send({ lead: {
      company: 'Acme Plumbing', url: 'https://acmeplumbing.example', fitScore: 88,
      contacts: { emails: ['owner@acmeplumbing.example'], phones: [] }, pain_points: ['missed calls'],
      sequence: [{ day: 1, channel: 'email', subject: 'Hi', body: 'Hello Jordan' }],
      iceBreaker: { title: 'Free call audit', deliverable: 'Three fixes' },
    } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 42, deduped: false });
    expect(saveLead).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Acme Plumbing', email: 'owner@acmeplumbing.example', icp_score: 0.88, buying_signals: ['missed calls'],
      outreach_sequence: [{ day: 1, channel: 'email', subject: 'Hi', body: 'Hello Jordan' }],
      ice_breaker: { title: 'Free call audit', deliverable: 'Three fixes' },
    }), { userId: 7, workspaceId: 'ws-1' });
  });
});

describe('Tavily client', () => {
  test('falls back to the server key for the owner when they have none', async () => {
    process.env.TAVILY_API_KEY = 'tvly-server';
    const key = await resolveTavilyKey(7, { loadUserKey: async () => null, mayUse: async () => true });
    expect(key).toEqual({ apiKey: 'tvly-server', source: 'server' });
    const teammate = await resolveTavilyKey(8, { loadUserKey: async () => null, mayUse: async () => false });
    expect(teammate).toEqual({ apiKey: '', source: null });
    delete process.env.TAVILY_API_KEY;
  });

  test('a rejected key surfaces as TAVILY_KEY_INVALID', async () => {
    const client = createTavilyClient('bad', { fetchImpl: async () => ({ ok: false, status: 401 }) });
    await expect(client.search('x')).rejects.toMatchObject({ code: 'TAVILY_KEY_INVALID', statusCode: 424 });
    await expect(client.search('x')).rejects.toThrow(/did not accept that API key/);
  });

  test('rate limits, spent credits and outages get plain-words errors', async () => {
    const failWith = (status) => createTavilyClient('tvly-x', { fetchImpl: async () => ({ ok: false, status }) });
    await expect(failWith(429).search('x')).rejects.toMatchObject({ code: 'TAVILY_RATE_LIMITED' });
    await expect(failWith(432).search('x')).rejects.toMatchObject({ code: 'TAVILY_OUT_OF_CREDITS' });
    await expect(failWith(500).search('x')).rejects.toThrow(/Tavily had a problem on its side \(500\)/);
  });

  test('a Tavily call that hangs times out instead of spinning forever', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    const client = createTavilyClient('tvly-x', { fetchImpl, timeoutMs: 20 });
    await expect(client.search('x')).rejects.toMatchObject({ code: 'TAVILY_TIMEOUT' });
  });
});
