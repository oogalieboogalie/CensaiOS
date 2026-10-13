// The Tools panel's routes. Pins: sign-in required, each person only sees
// and changes their own servers, a new server is off for every agent until
// given to one, the key is never sent back, programs only run on the
// desktop app and only for an admin, and a server that cannot be reached is
// kept with its error so it can be checked again.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let mode = 'local_desktop';
const servers = new Map();
const grants = [];
const secrets = new Map();
let seq = 0;
const roles = { 1: 'admin', 2: 'user' };

class OutsideToolStoreError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}
const mine = (userId) => [...servers.values()].filter((s) => s.user_id === userId);
const memStore = {
  OutsideToolStoreError,
  listServers: async (_db, { userId }) => mine(userId),
  getServer: async (_db, { userId, serverId }) => { const s = servers.get(serverId); return s && s.user_id === userId ? s : null; },
  createServer: async (_db, input) => {
    seq += 1;
    const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    const row = {
      id, user_id: input.userId, name: input.name, slug: input.name.toLowerCase(), transport: input.transport,
      url: input.url || null, command: input.command || null, args: input.args || [], secret_env: input.secretEnv || null,
      has_secret: false, enabled: true, tools: [], last_checked_at: null, last_error: null,
    };
    servers.set(id, row);
    return row;
  },
  setEnabled: async (_db, { serverId, enabled }) => Object.assign(servers.get(serverId), { enabled }),
  saveCheck: async (_db, { serverId, tools, error }) => Object.assign(servers.get(serverId), {
    ...(tools ? { tools } : {}), last_error: error || null, last_checked_at: new Date().toISOString(),
  }),
  deleteServer: async (_db, { serverId }) => { secrets.delete(serverId); return servers.delete(serverId); },
  saveSecret: async (_db, { serverId, secret }) => {
    if (secret) secrets.set(serverId, secret); else secrets.delete(serverId);
    servers.get(serverId).has_secret = Boolean(secret);
  },
  readSecret: async (_db, { server }) => secrets.get(server.id) || '',
  grantsFor: async (_db, { userId }) => grants.filter((g) => servers.get(g.server_id)?.user_id === userId),
  setGrant: async (_db, { serverId, agentId, allowed }) => {
    const i = grants.findIndex((g) => g.server_id === serverId && g.agent_id === agentId);
    if (allowed && i < 0) grants.push({ server_id: serverId, agent_id: agentId });
    if (!allowed && i >= 0) grants.splice(i, 1);
  },
  recentCalls: async () => [{ id: 1, server_name: 'Weather', tool: 'get_forecast', origin: 'chat', ok: true, duration_ms: 9, error: null, created_at: 'now' }],
};

const listTools = jest.fn(async (server, secret) => {
  if (String(server.url || '').includes('down')) throw new Error('The tool server did not answer.');
  return [{ name: 'get_forecast', description: `key=${secret ? 'yes' : 'no'}`, inputSchema: { type: 'object' } }];
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/outsideTools/store.js', () => memStore);
jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({
  localFilesystemAllowed: () => mode !== 'cloud_saas',
  isCloudRuntime: () => mode === 'cloud_saas',
}));
jest.unstable_mockModule('../server/security/systemAdmin.js', () => ({
  assertSystemAdmin: async (req) => {
    if (roles[req.session.userId] !== 'admin') throw Object.assign(new Error('System administrator access is required.'), { statusCode: 403 });
  },
}));

const { createOutsideToolsRouter } = await import('../server/routes/outsideTools.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { const u = req.get('x-test-user'); req.session = u ? { userId: Number(u) } : {}; next(); });
  a.use('/api/outside-tools', createOutsideToolsRouter({ db: {}, isReady: () => true, listTools }));
  return a;
}
const as = (user) => ({ 'x-test-user': String(user) });

beforeEach(() => { mode = 'local_desktop'; servers.clear(); grants.length = 0; secrets.clear(); });

test('sign-in required', async () => {
  expect((await request(app()).get('/api/outside-tools')).status).toBe(401);
});

test('add a web address server: checked, key kept back, off for every agent', async () => {
  const res = await request(app()).post('/api/outside-tools?agentId=atlas').set(as(1))
    .send({ transport: 'http', name: 'Weather', url: 'http://localhost:8765/mcp', key: 'wx-1' });
  expect(res.status).toBe(201);
  const [server] = res.body.servers;
  expect(server).toMatchObject({ name: 'Weather', hasKey: true, agents: [], enabled: true, lastError: null });
  expect(server.tools).toEqual([{ name: 'get_forecast', description: 'key=yes', modelName: 'mcp__weather__get_forecast' }]);
  expect(JSON.stringify(res.body)).not.toContain('wx-1');
  expect(res.body.calls).toHaveLength(1);
});

test('give it to one agent, take it back, and other people cannot touch it', async () => {
  const add = await request(app()).post('/api/outside-tools').set(as(1)).send({ transport: 'http', name: 'Weather', url: 'http://localhost:1/mcp' });
  const id = add.body.servers[0].id;
  const given = await request(app()).put(`/api/outside-tools/${id}/agents/atlas`).set(as(1)).send({ allowed: true });
  expect(given.body.servers[0].agents).toEqual(['atlas']);
  expect((await request(app()).put(`/api/outside-tools/${id}/agents/atlas`).set(as(2)).send({ allowed: true })).status).toBe(404);
  expect((await request(app()).get('/api/outside-tools').set(as(2))).body.servers).toEqual([]);
  expect((await request(app()).delete(`/api/outside-tools/${id}`).set(as(2))).status).toBe(404);
  const taken = await request(app()).put(`/api/outside-tools/${id}/agents/atlas`).set(as(1)).send({ allowed: false });
  expect(taken.body.servers[0].agents).toEqual([]);
  const off = await request(app()).patch(`/api/outside-tools/${id}`).set(as(1)).send({ enabled: false });
  expect(off.body.servers[0].enabled).toBe(false);
  const gone = await request(app()).delete(`/api/outside-tools/${id}`).set(as(1));
  expect(gone.body.servers).toEqual([]);
});

test('a server that cannot be reached is kept with its error', async () => {
  const res = await request(app()).post('/api/outside-tools').set(as(1)).send({ transport: 'http', name: 'Down', url: 'http://down.local/mcp' });
  expect(res.status).toBe(201);
  expect(res.body.servers[0].lastError).toMatch(/did not answer/);
});

test('bad addresses are refused before anything is saved', async () => {
  const res = await request(app()).post('/api/outside-tools').set(as(1)).send({ transport: 'http', name: 'X', url: 'file:///etc/passwd' });
  expect(res.status).toBe(400);
  expect(servers.size).toBe(0);
});

test('programs: desktop app and admins only', async () => {
  const program = { transport: 'stdio', name: 'Echo', command: 'node server.mjs --dir "My Files"', key: 'k', keyEnv: 'echo_key' };
  expect((await request(app()).post('/api/outside-tools').set(as(2)).send(program)).status).toBe(403);
  const ok = await request(app()).post('/api/outside-tools').set(as(1)).send(program);
  expect(ok.status).toBe(201);
  expect(ok.body.servers[0]).toMatchObject({ transport: 'stdio', address: 'node server.mjs --dir My Files', keyEnv: 'ECHO_KEY' });
  mode = 'cloud_saas';
  const cloud = await request(app()).post('/api/outside-tools').set(as(1)).send(program);
  expect(cloud.status).toBe(403);
  expect(cloud.body.error).toMatch(/desktop app/);
  expect((await request(app()).get('/api/outside-tools').set(as(1))).body.programsAllowed).toBe(false);
});
