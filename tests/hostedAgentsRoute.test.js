import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// /api/agent-import/hosted: owner only, the person's own key, and an import that
// makes a normal board agent plus its hosted row.

const { createHostedAgentsRouter, hostedAgentPayload } = await import('../server/routes/hostedAgents.js');
const { getVendor } = await import('../server/hostedAgents/vendors/index.js');
const { requireSystemAdmin } = await import('../server/security/systemAdmin.js');
const { createAgentImportRouter } = await import('../server/routes/agentImport.js');

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeDb(existingIds = []) {
  const writes = [];
  return {
    writes,
    query: jest.fn(async (sql, params) => {
      if (/SELECT id FROM agents/.test(sql)) return { rows: existingIds.map((id) => ({ id })) };
      writes.push({ sql, params });
      return { rows: [] };
    }),
  };
}

function app({ db = fakeDb(), fetchImpl, vault, upsert, owner = true } = {}) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api/agent-import/hosted', createHostedAgentsRouter({
    db,
    fetchImpl,
    getUserApiKeyConfig: vault || (async (_u, provider) => ({ apiKey: `key-for-${provider}` })),
    upsertAgent: upsert || (async (agent) => ({ ...agent, tool_scopes: agent.toolScopes })),
    ownerGate: (req, res, next) => (owner ? next() : res.status(403).json({ error: "Only this computer's owner can do this." })),
  }));
  return a;
}

test('mounted under Import, behind the owner check', async () => {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api/agent-import', createAgentImportRouter({ hostedRouter: createHostedAgentsRouter({ ownerGate: (_q, res) => res.status(403).json({ error: 'owner only' }) }) }));
  expect((await request(a).get('/api/agent-import/hosted/vendors')).status).toBe(403);
  expect(createHostedAgentsRouter.toString()).toContain('requireSystemAdmin');
  expect(typeof requireSystemAdmin).toBe('function');
});

test('teammates who are not the owner are refused', async () => {
  const res = await request(app({ owner: false })).post('/api/agent-import/hosted/test').send({ vendor: 'anthropic' });
  expect(res.status).toBe(403);
});

test('vendor list for the Import screen', async () => {
  const res = await request(app()).get('/api/agent-import/hosted/vendors');
  expect(res.body.vendors.map((v) => v.id)).toContain('langchain');
});

test('test the connection with the person own key', async () => {
  const fetchImpl = jest.fn(async (url, init) => {
    expect(init.headers['x-api-key']).toBe('key-for-anthropic');
    return json({ id: 'agent_01FAKE', name: 'Order Helper', description: 'Answers order questions' });
  });
  const res = await request(app({ fetchImpl })).post('/api/agent-import/hosted/test')
    .send({ vendor: 'anthropic', ref: 'agent_01FAKE', endpoint: 'env_01FAKE' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, vendor: 'anthropic', name: 'Order Helper', description: 'Answers order questions' });
});

test('no key saved: plain words, nothing called', async () => {
  const fetchImpl = jest.fn();
  const res = await request(app({ fetchImpl, vault: async () => null })).post('/api/agent-import/hosted/test')
    .send({ vendor: 'anthropic', ref: 'agent_01FAKE', endpoint: 'env_01FAKE' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/Anthropic API key.*billed by Anthropic/);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('a bad paste is explained', async () => {
  const res = await request(app()).post('/api/agent-import/hosted/test').send({ vendor: 'openai', ref: 'wf_123' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/workflow/);
});

test('import makes a board agent with a free id and saves the hosted row', async () => {
  const db = fakeDb(['order-helper']);
  const saved = [];
  const fetchImpl = async () => json({ id: 'agent_01FAKE', name: 'Order Helper', system: 'You help with orders.' });
  const res = await request(app({ db, fetchImpl, upsert: async (a) => { saved.push(a); return a; } }))
    .post('/api/agent-import/hosted/import').send({ vendor: 'anthropic', ref: 'agent_01FAKE', endpoint: 'env_01FAKE', hue: 40 });
  expect(res.status).toBe(200);
  expect(saved[0]).toMatchObject({ id: 'order-helper-2', name: 'Order Helper', model_provider: 'hosted', model_name: 'anthropic', hue: 40 });
  expect(saved[0].toolScopes.hosted).toEqual({ vendor: 'anthropic', label: 'Claude', billedBy: 'Anthropic' });
  const row = db.writes.find((w) => /INSERT INTO hosted_agents/.test(w.sql));
  expect(row.params.slice(0, 4)).toEqual(['order-helper-2', 'anthropic', 'agent_01FAKE', 'env_01FAKE']);
  expect(JSON.stringify(res.body)).not.toContain('key-for-anthropic');
});

test('make a new ElevenLabs agent, then import it', async () => {
  const db = fakeDb();
  const fetchImpl = jest.fn(async (url, init) => {
    expect(String(url)).toContain('/v1/convai/agents/create');
    expect(JSON.parse(init.body).conversation_config.agent.prompt.prompt).toBe('Answer bookings.');
    return json({ agent_id: 'agent_newFAKE01' });
  });
  const res = await request(app({ db, fetchImpl })).post('/api/agent-import/hosted/elevenlabs/create')
    .send({ name: 'Front Desk', instructions: 'Answer bookings.', firstMessage: 'Hi!' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ref: 'agent_newFAKE01', agent: { id: 'front-desk', name: 'Front Desk' } });
  expect(db.writes.find((w) => /INSERT INTO hosted_agents/.test(w.sql)).params[1]).toBe('elevenlabs');
  const missing = await request(app()).post('/api/agent-import/hosted/elevenlabs/create').send({ name: 'x' });
  expect(missing.status).toBe(400);
});

test('if the hosted row cannot be saved, the half-made board agent is removed', async () => {
  const db = fakeDb();
  db.query.mockImplementation(async (sql) => {
    if (/SELECT id FROM agents/.test(sql)) return { rows: [] };
    if (/INSERT INTO hosted_agents/.test(sql)) throw new Error('relation "hosted_agents" does not exist');
    db.writes.push({ sql });
    return { rows: [] };
  });
  const fetchImpl = async () => json({ id: 'agent_01FAKE', name: 'Order Helper' });
  const res = await request(app({ db, fetchImpl })).post('/api/agent-import/hosted/import').send({ vendor: 'anthropic', ref: 'agent_01FAKE', endpoint: 'env_01FAKE' });
  expect(res.status).toBe(500);
  expect(db.writes.some((w) => /DELETE FROM agents/.test(w.sql))).toBe(true);
});

test('payload never carries a key and keeps names short', () => {
  const payload = hostedAgentPayload({ id: 'a', vendor: getVendor('google'), found: { name: 'x'.repeat(200) }, hue: 'nope' });
  expect(payload.name).toHaveLength(80);
  expect(payload.hue).toBe(222);
  expect(payload.toolScopes.hosted.vendor).toBe('google');
});
