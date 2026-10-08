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

  test('save banks a hunted lead in the Lead Queue', async () => {
    saveLead.mockResolvedValue({ id: 42, deduped: false });
    const res = await request(app()).post('/api/leadhound/save').send({ lead: {
      company: 'Acme Plumbing', url: 'https://acmeplumbing.example', fitScore: 88,
      contacts: { emails: ['owner@acmeplumbing.example'], phones: [] }, pain_points: ['missed calls'],
    } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 42, deduped: false });
    expect(saveLead).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Acme Plumbing', email: 'owner@acmeplumbing.example', icp_score: 0.88, buying_signals: ['missed calls'],
    }), { userId: 7, workspaceId: 'ws-1' });
  });
});

describe('Tavily client', () => {
  test('falls back to the server key when the user has none', async () => {
    process.env.TAVILY_API_KEY = 'tvly-server';
    const key = await resolveTavilyKey(7, { loadUserKey: async () => null });
    expect(key).toEqual({ apiKey: 'tvly-server', source: 'server' });
    delete process.env.TAVILY_API_KEY;
  });

  test('a rejected key surfaces as TAVILY_KEY_INVALID', async () => {
    const client = createTavilyClient('bad', { fetchImpl: async () => ({ ok: false, status: 401 }) });
    await expect(client.search('x')).rejects.toMatchObject({ code: 'TAVILY_KEY_INVALID', statusCode: 424 });
  });
});
