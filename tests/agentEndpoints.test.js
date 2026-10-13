// Agent endpoints: a board agent answers apps outside censaiOS over MCP or
// plain HTTP. Pins the safety rules: off by default, keys scoped to one
// agent, revoked keys stop at once, owners only see their own endpoints,
// limits apply, and every call is logged and shown on the board.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createMemoryStore } from './fixtures/agent-endpoints/memoryStore.js';

const memStore = createMemoryStore();
const runAgent = jest.fn(async ({ endpoint, question }) => `${endpoint.agent_name} says: ${question}`);
const shown = [];

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/agentEndpoints/store.js', () => memStore);
jest.unstable_mockModule('../server/agentEndpoints/runAgent.js', () => ({
  runAgentForOutsideCall: runAgent,
  OUTSIDE_CALLER_TOOLS: ['recall', 'web_search'],
}));
jest.unstable_mockModule('../server/agentEndpoints/boardLog.js', () => ({
  logOutsideCallOnBoard: jest.fn(async (endpoint, call) => { shown.push({ endpoint: endpoint.id, ...call }); return 'win-1'; }),
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  requireWorkspaceMember: jest.fn(async (_db, { userId, workspaceId }) => {
    if (workspaceId !== `ws-${userId}`) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    return { id: workspaceId, role: 'owner' };
  }),
}));

const { createAgentEndpointsRouter } = await import('../server/routes/agentEndpoints.js');
const { createAgentEndpointPublicRouter } = await import('../server/routes/agentEndpointsPublic.js');
const { createLimiter } = await import('../server/agentEndpoints/rateLimit.js');
const callAgent = await import('../server/agentEndpoints/callAgent.js');

function makeApp({ limits } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = req.get('x-test-user');
    req.session = user ? { userId: Number(user) } : {};
    next();
  });
  const limiter = createLimiter(limits ? { limits } : undefined);
  app.use('/api/mcp', createAgentEndpointPublicRouter({
    db: null, store: memStore, limiter, runAgent,
    showOnBoard: async (endpoint, call) => { shown.push({ endpoint: endpoint.id, ...call }); },
  }));
  app.use('/api/agent-endpoints', createAgentEndpointsRouter({ db: null, isReady: () => true }));
  return app;
}

async function shareAgent(app, { user = 1, agentId = 'atlas', agentName = 'Atlas' } = {}) {
  const res = await request(app).post('/api/agent-endpoints').set('x-test-user', String(user))
    .send({ workspaceId: `ws-${user}`, agentId, agentName, windowId: 'win-1' });
  expect(res.status).toBe(200);
  return res.body.endpoint;
}

async function newKey(app, endpointId, user = 1, label = 'Claude Code') {
  const res = await request(app).post(`/api/agent-endpoints/${endpointId}/keys`).set('x-test-user', String(user)).send({ label });
  expect(res.status).toBe(201);
  return res.body.key;
}

const enable = (app, id, enabled = true, user = 1) => request(app).patch(`/api/agent-endpoints/${id}`)
  .set('x-test-user', String(user)).send({ enabled });

const rpc = (app, id, key, body) => {
  const req = request(app).post(`/api/mcp/agents/${id}`).set('Accept', 'application/json, text/event-stream');
  return (key ? req.set('Authorization', `Bearer ${key}`) : req).send(body);
};
const ask = (app, id, key, message) => request(app).post(`/api/mcp/agents/${id}/ask`)
  .set('Authorization', `Bearer ${key}`).send({ message });

beforeEach(() => { runAgent.mockClear(); shown.length = 0; });

test('a shared agent starts switched off, and an off agent answers nobody', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app);
  expect(endpoint.enabled).toBe(false);
  expect(endpoint.cardId).toBe('agent:atlas');
  expect(endpoint.mcpPath).toBe(`/api/mcp/agents/${endpoint.id}`);
  const key = await newKey(app, endpoint.id);
  const res = await ask(app, endpoint.id, key, 'hello');
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not shared right now/);
  expect(runAgent).not.toHaveBeenCalled();
});

test('MCP: initialize, list the agent as one tool, call it, and see it logged and on the board', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app);
  const key = await newKey(app, endpoint.id);
  await enable(app, endpoint.id);

  const init = await rpc(app, endpoint.id, key, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  expect(init.status).toBe(200);
  expect(init.body.result.protocolVersion).toBe('2025-06-18');
  expect(init.body.result.capabilities.tools).toBeDefined();

  const note = await rpc(app, endpoint.id, key, { jsonrpc: '2.0', method: 'notifications/initialized' });
  expect(note.status).toBe(202);

  const list = await rpc(app, endpoint.id, key, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  expect(list.body.result.tools.map((t) => t.name)).toEqual(['ask_atlas']);
  expect(list.body.result.tools[0].inputSchema.required).toEqual(['message']);

  const call = await rpc(app, endpoint.id, key, {
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ask_atlas', arguments: { message: 'What is next?' } },
  });
  expect(call.body.result).toEqual({ content: [{ type: 'text', text: 'Atlas says: What is next?' }], isError: false });
  expect(memStore.calls.at(-1)).toMatchObject({ endpointId: endpoint.id, via: 'mcp', status: 'ok', question: 'What is next?' });
  expect(shown.at(-1)).toMatchObject({ via: 'mcp', question: 'What is next?', answer: 'Atlas says: What is next?', keyLabel: 'Claude Code' });

  const detail = await request(app).get(`/api/agent-endpoints/${endpoint.id}`).set('x-test-user', '1');
  expect(detail.body.calls[0]).toMatchObject({ via: 'mcp', status: 'ok' });
  expect(JSON.stringify(detail.body)).not.toContain(key);
  expect(detail.body.keys.some((k) => k.lastUsedAt)).toBe(true);
});

test('a key only opens the agent it was made for', async () => {
  const app = makeApp();
  const atlas = await shareAgent(app);
  const sage = await shareAgent(app, { agentId: 'sage', agentName: 'Sage' });
  await enable(app, atlas.id);
  await enable(app, sage.id);
  const atlasKey = await newKey(app, atlas.id);
  expect((await ask(app, sage.id, atlasKey, 'hi')).status).toBe(401);
  expect((await ask(app, atlas.id, atlasKey, 'hi')).status).toBe(200);
  expect(runAgent).toHaveBeenCalledTimes(1);
});

test('missing, malformed and unknown keys are refused the same way', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app);
  await enable(app, endpoint.id);
  const none = await rpc(app, endpoint.id, null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  expect(none.status).toBe(401);
  expect(none.headers['www-authenticate']).toMatch(/Bearer/);
  expect((await ask(app, endpoint.id, 'nope', 'hi')).status).toBe(401);
  expect((await ask(app, endpoint.id, `cak_${'A'.repeat(43)}`, 'hi')).status).toBe(401);
  expect((await ask(app, 'not-a-uuid', `cak_${'A'.repeat(43)}`, 'hi')).status).toBe(404);
});

test('a revoked key stops working right away; other keys keep working', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app);
  await enable(app, endpoint.id);
  const keep = await newKey(app, endpoint.id, 1, 'Cursor');
  const drop = await newKey(app, endpoint.id, 1, 'Old laptop');
  expect((await ask(app, endpoint.id, drop, 'hi')).status).toBe(200);
  const dropRow = [...memStore.tokens.values()].find((t) => t.label === 'Old laptop' && t.endpoint_id === endpoint.id);
  const revoked = await request(app).delete(`/api/agent-endpoints/${endpoint.id}/keys/${dropRow.id}`).set('x-test-user', '1');
  expect(revoked.status).toBe(200);
  expect(revoked.body.keys.find((k) => k.id === dropRow.id).revokedAt).toBeTruthy();
  expect((await ask(app, endpoint.id, drop, 'hi')).status).toBe(401);
  expect((await ask(app, endpoint.id, keep, 'hi')).status).toBe(200);
});

test('turning sharing off again closes the door for every key', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app);
  const key = await newKey(app, endpoint.id);
  await enable(app, endpoint.id, true);
  expect((await ask(app, endpoint.id, key, 'hi')).status).toBe(200);
  await enable(app, endpoint.id, false);
  expect((await ask(app, endpoint.id, key, 'hi')).status).toBe(403);
});

test('owners only see and change their own endpoints and workspaces', async () => {
  const app = makeApp();
  const mine = await shareAgent(app, { user: 1 });
  const other = await request(app).get(`/api/agent-endpoints/${mine.id}`).set('x-test-user', '2');
  expect(other.status).toBe(404);
  expect((await enable(app, mine.id, true, 2)).status).toBe(404);
  expect((await request(app).post(`/api/agent-endpoints/${mine.id}/keys`).set('x-test-user', '2').send({})).status).toBe(404);
  const wrongBoard = await request(app).post('/api/agent-endpoints').set('x-test-user', '2')
    .send({ workspaceId: 'ws-1', agentId: 'atlas', agentName: 'Atlas' });
  expect(wrongBoard.status).toBe(403);
  expect((await request(app).get(`/api/agent-endpoints/${mine.id}`)).status).toBe(401);
});

test('each key is rate limited, and limited calls are logged', async () => {
  const app = makeApp({ limits: { callsPerMinute: 2, concurrentPerKey: 2, badKeysPerMinute: 30 } });
  const endpoint = await shareAgent(app, { agentId: 'nexus', agentName: 'Nexus' });
  await enable(app, endpoint.id);
  const key = await newKey(app, endpoint.id);
  expect((await ask(app, endpoint.id, key, 'one')).status).toBe(200);
  expect((await ask(app, endpoint.id, key, 'two')).status).toBe(200);
  const third = await ask(app, endpoint.id, key, 'three');
  expect(third.status).toBe(429);
  expect(third.headers['retry-after']).toBeTruthy();
  expect(memStore.calls.at(-1)).toMatchObject({ status: 'limited', question: 'three' });
});

test('empty and oversized messages are refused before the agent runs', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app, { agentId: 'echo', agentName: 'Echo' });
  await enable(app, endpoint.id);
  const key = await newKey(app, endpoint.id);
  expect((await ask(app, endpoint.id, key, '   ')).status).toBe(400);
  expect((await ask(app, endpoint.id, key, 'x'.repeat(callAgent.MAX_QUESTION_CHARS + 1))).status).toBe(413);
  const mcpEmpty = await rpc(app, endpoint.id, key, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ask_echo', arguments: {} } });
  expect(mcpEmpty.body.result.isError).toBe(true);
  expect(runAgent).not.toHaveBeenCalled();
});

test('a failing agent becomes a readable tool error, and the failure is logged', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app, { agentId: 'flaky', agentName: 'Flaky' });
  await enable(app, endpoint.id);
  const key = await newKey(app, endpoint.id);
  runAgent.mockRejectedValueOnce(Object.assign(new Error('No AI provider is configured. Add a provider key'), { code: 'AI_CONFIGURATION_REQUIRED' }));
  const res = await rpc(app, endpoint.id, key, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ask_flaky', arguments: { message: 'hi' } } });
  expect(res.body.result.isError).toBe(true);
  expect(res.body.result.content[0].text).toMatch(/model key/);
  expect(memStore.calls.at(-1)).toMatchObject({ status: 'error' });
  expect(shown.at(-1).error).toMatch(/model key/);
});

test('GET on the MCP address says POST only (stateless server, no stream)', async () => {
  const app = makeApp();
  const endpoint = await shareAgent(app, { agentId: 'quiet', agentName: 'Quiet' });
  const res = await request(app).get(`/api/mcp/agents/${endpoint.id}`);
  expect(res.status).toBe(405);
  expect(res.headers.allow).toBe('POST');
});
