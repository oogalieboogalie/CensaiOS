import { jest } from '@jest/globals';
import express from 'express';
import http from 'node:http';
import request from 'supertest';

const logs = [];
jest.unstable_mockModule('../server/logger.js', () => {
  const make = (name) => ({
    info: (m) => logs.push(`[${name}] ${m}`), warn: (m, meta) => logs.push(`[${name}] ${m}${meta ? ` ${JSON.stringify(meta)}` : ''}`),
    error: () => {}, debug: () => {}, startTimer: () => () => {}, child: () => make(name),
  });
  return { createLogger: make, default: make('app'), onLogRecord: () => () => {} };
});
const pullSpy = jest.fn(async () => ({ pulled: false }));
jest.unstable_mockModule('../server/operational-intelligence/localPull.js', () => ({
  safeFastForwardCurrentProject: pullSpy,
  syncPulledTodoArtifacts: async () => [],
}));

const { default: pool } = await import('../server/db.js');
const { githubRouter } = await import('../server/routes/github/index.js');
const { githubToken, resolveGithubWriteToken } = await import('../server/github/writeToken.js');
const { writeFile } = await import('../server/routes/github/content.js');
const { operationalIntelligenceRouter } = await import('../server/routes/operationalIntelligence.js');
const { handleHttpTool } = await import('../server/tools/handlers/http.js');

// Made-up people: Pat Example (1) owns this computer, Sam Example (2) is a
// teammate with no GitHub key of their own, Mo Example (3) has their own key.
const USERS = { 1: { role: 'admin', name: 'Pat Example' }, 2: { role: 'user', name: 'Sam Example' }, 3: { role: 'user', name: 'Mo Example' } };
pool.query = jest.fn(async (sql, params = []) => {
  if (sql.startsWith('SELECT role FROM users')) return { rows: USERS[params[0]] ? [{ role: USERS[params[0]].role }] : [] };
  if (sql.includes("role = 'admin'")) return { rows: [{ name: USERS[1].name }] };
  if (sql.includes('AS name FROM users WHERE id')) return { rows: USERS[params[0]] ? [{ name: USERS[params[0]].name }] : [] };
  return { rows: [] };
});
const ownKey = async (id) => (id === 3 ? { apiKey: 'mo-own-token' } : null);
const realFetch = globalThis.fetch;
let sentTokens = [];

beforeEach(() => {
  logs.length = 0;
  sentTokens = [];
  process.env.CENSAI_MODE = 'local_desktop';
  process.env.GITHUB_TOKEN = 'owner-env-token';
  globalThis.fetch = jest.fn(async (url, init = {}) => {
    sentTokens.push(String(init.headers?.Authorization || ''));
    if (init.method === 'PUT') return new Response(JSON.stringify({ commit: { sha: 'abc' }, content: {} }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CENSAI_MODE;
  delete process.env.GITHUB_TOKEN;
});

const as = (userId, router, base) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use(base, router);
  return app;
};
const writeBody = { repo: 'pat/shop', path: 'a.txt', content: 'aGk=' };

describe('GitHub window changes with the owner GITHUB_TOKEN', () => {
  test.each([
    ['post', '/api/github/write', writeBody],
    ['post', '/api/github/issues', { repo: 'pat/shop', title: 'Hi' }],
    ['post', '/api/github/issues/labels', { repo: 'pat/shop', number: 1, labels: ['x'] }],
    ['put', '/api/github/pulls/merge', { repo: 'pat/shop', number: 1 }],
  ])('a teammate without their own key is refused: %s %s', async (method, path, body) => {
    const res = await request(as(2, githubRouter, '/api/github'))[method](path).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Only this computer's owner can do this.");
    expect(res.body.error).toContain('The owner account is Pat Example');
    expect(sentTokens).toEqual([]);
    expect(logs.join('\n')).toMatch(/\[owner-only\] refused github .*: not the owner/);
    expect(logs.join('\n')).not.toMatch(/Sam|Pat|token/);
  });

  test('the owner writes with the .env token', async () => {
    const res = await request(as(1, githubRouter, '/api/github')).post('/api/github/write').send(writeBody);
    expect(res.status).toBe(200);
    expect(sentTokens.at(-1)).toBe('Bearer owner-env-token');
  });

  test('a teammate with their own GitHub key writes with it', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: 3 }; next(); });
    app.post('/write', githubToken({ write: 'github write file', loadUserKey: ownKey }), writeFile);
    const res = await request(app).post('/write').send(writeBody);
    expect(res.status).toBe(200);
    expect(sentTokens.every((t) => t === 'Bearer mo-own-token')).toBe(true);
  });

  test('merge desk: own key first, the .env token for writes only for the owner', async () => {
    const req = (userId) => ({ session: { userId } });
    expect(await resolveGithubWriteToken(req(3), { loadUserKey: ownKey })).toEqual({ token: 'mo-own-token', source: 'byok' });
    expect(await resolveGithubWriteToken(req(1), { loadUserKey: ownKey })).toEqual({ token: 'owner-env-token', source: 'server' });
    await expect(resolveGithubWriteToken(req(2), { loadUserKey: ownKey, feature: 'github desk merge' })).rejects.toMatchObject({ status: 403 });
    expect(logs).toContain('[owner-only] refused github desk merge: not the owner');
  });

  test('looking still works for a teammate with the .env token', async () => {
    const res = await request(as(2, githubRouter, '/api/github')).get('/api/github/repos');
    expect(res.status).toBe(404); // reached GitHub (the fake answers 404)
    expect(sentTokens).toEqual(['token owner-env-token']);
  });
});

describe('Pull merged changes runs git on this computer: owner only', () => {
  beforeEach(() => { process.env.CENSAI_FEATURES = 'operational-intelligence'; });
  afterEach(() => { delete process.env.CENSAI_FEATURES; });
  test('a teammate who owns their board is refused before git runs', async () => {
    const res = await request(as(2, operationalIntelligenceRouter, '/api/oi')).post('/api/oi/sync/pull-merged').send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('computer_owner_only');
    expect(pullSpy).not.toHaveBeenCalled();
  });

  test('the owner gets past the owner check', async () => {
    const res = await request(as(1, operationalIntelligenceRouter, '/api/oi')).post('/api/oi/sync/pull-merged').send({});
    expect(res.body.code).not.toBe('computer_owner_only');
  });
});

describe('HTTP Test agent tool and private addresses', () => {
  let server;
  let port;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('inside'));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(() => { globalThis.fetch = realFetch; });

  const privateResolve = async () => [{ address: '192.168.1.20', family: 4 }];
  test.each([
    ['127.0.0.1', undefined], ['localhost', undefined], ['10.0.0.5', undefined], ['192.168.1.1', undefined],
    ['169.254.169.254', undefined], ['printer.home.test', privateResolve],
  ])('a teammate agent cannot reach %s', async (host, resolve) => {
    const out = await handleHttpTool('a1', 'http_test', { url: `http://${host}:${port}/` }, { userId: 2 }, resolve ? { resolve } : {});
    expect(out).toContain('inside this computer or a private network');
    expect(out).not.toContain('Status:');
    expect(logs.join('\n')).toContain('[tools] http_test refused: private network');
    expect(logs.join('\n')).toMatch(/private network \{"kind":"(loopback|private|link-local)","userId":2\}$/m);
  });

  test('the owner agent still tests a server on this computer', async () => {
    const out = await handleHttpTool('a1', 'http_test', { url: `http://127.0.0.1:${port}/` }, { userId: 1 });
    expect(out).toContain('Status:     200');
    expect(out).toContain('inside');
  });

  test('on a hosted censaiOS even the owner gets public addresses only', async () => {
    process.env.CENSAI_MODE = 'cloud_saas';
    const out = await handleHttpTool('a1', 'http_test', { url: `http://127.0.0.1:${port}/` }, { userId: 1 });
    expect(out).toContain('inside this computer or a private network');
  });
});
