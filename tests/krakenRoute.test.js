import { jest } from '@jest/globals';
import request from 'supertest';

// Kraken Requests (server/routes/agents/krakenRequests.js) through a real
// request. Made-up people at Testco: Pat (user 1) owns the board, Sam (user 2)
// is a member and Vic (user 3) can only look.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const MEMBERS = { 'ws-testco': { 1: 'owner', 2: 'member', 3: 'viewer' } };
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async (_db, { userId, workspaceId }) => {
    const role = MEMBERS[workspaceId]?.[Number(userId)];
    if (!role) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    return { id: workspaceId, role };
  }),
}));

const REQUEST_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const rows = new Map();
const mine = ({ workspaceId, userId }) => [...rows.values()].filter((row) => row.workspace_id === workspaceId && row.user_id === userId);
const insertRequest = jest.fn(async (_db, input) => {
  const row = {
    id: REQUEST_ID, workspace_id: input.workspaceId, user_id: input.userId, title: input.title, project: input.project,
    mode: input.mode, status: 'open', arms: input.arms, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
  };
  rows.set(row.id, row);
  return row;
});
jest.unstable_mockModule('../server/kraken/store.js', () => ({
  insertRequest,
  getRequest: jest.fn(async (_db, { id, ...who }) => mine(who).find((row) => row.id === id) || null),
  listRequests: jest.fn(async (_db, who) => mine(who)),
  listOpenRequests: jest.fn(async (_db, who) => mine(who).filter((row) => row.status === 'open')),
}));
const feed = jest.fn(async () => {});
const stopRequest = jest.fn(async ({ id, ...who }) => {
  const row = mine(who).find((item) => item.id === id);
  if (row) row.status = 'stopped';
  return row || null;
});
jest.unstable_mockModule('../server/kraken/feeder.js', () => ({ feed, stopRequest }));

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { krakenRouter } = await import('../server/routes/agents/krakenRequests.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId ? { userId } : {};
  next();
});
app.use('/api', requireAuthorizedSession, krakenRouter);

const REPORT = '# Review of the Testco shop\n- P0 - Checkout crashes when the cart is empty\n- P1 - Orders table has no index\n- P2 - Two date libraries';
const as = (userId, method, path) => request(app)[method](path).set('x-user-id', String(userId));

beforeEach(() => {
  rows.clear();
  jest.clearAllMocks();
});

describe('kraken requests route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).post('/api/kraken/preview').send({ workspaceId: 'ws-testco', report: REPORT })).status).toBe(401);
    expect((await request(app).post('/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT })).status).toBe(401);
    expect(insertRequest).not.toHaveBeenCalled();
  });

  test('a preview says who would get what and starts nothing', async () => {
    const res = await as(1, 'post', '/api/kraken/preview').send({ workspaceId: 'ws-testco', report: REPORT });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Review of the Testco shop');
    expect(res.body.arms.map((arm) => [arm.severity, arm.agentId, arm.kind])).toEqual([
      ['P0', expect.any(String), 'answer'], ['P1', 'nexus', 'answer'], ['P2', expect.any(String), 'answer'],
    ]);
    expect(insertRequest).not.toHaveBeenCalled();
    expect(feed).not.toHaveBeenCalled();
  });

  test('a report with nothing to hand out, and a fix with no project, are refused in plain words', async () => {
    const empty = await as(1, 'post', '/api/kraken/preview').send({ workspaceId: 'ws-testco', report: 'Just thoughts.' });
    const noProject = await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT, mode: 'fix' });
    expect([empty.status, noProject.status]).toEqual([400, 400]);
    expect(empty.body.error).toMatch(/could not find anything to hand out/);
    expect(noProject.body.error).toMatch(/which project/);
    expect(insertRequest).not.toHaveBeenCalled();
  });

  test('Pat releases the picked findings, and the first arms go out', async () => {
    const res = await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT, only: [1, 2] });
    expect(res.status).toBe(201);
    expect(res.body.request).toEqual(expect.objectContaining({ id: REQUEST_ID, status: 'open', mode: 'writeup' }));
    expect(res.body.request.arms.map((arm) => arm.n)).toEqual([1, 2]);
    expect(insertRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: 'ws-testco', userId: 1 }));
    expect(feed).toHaveBeenCalledWith({ workspaceId: 'ws-testco', userId: 1 });
  });

  test('one request at a time for each person', async () => {
    await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT });
    const second = await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT });
    expect(second.status).toBe(409);
    expect(insertRequest).toHaveBeenCalledTimes(1);
  });

  test('Vic, who can only look, cannot release or stop', async () => {
    const release = await as(3, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT });
    const stop = await as(3, 'post', `/api/kraken/requests/${REQUEST_ID}/stop`).send({ workspaceId: 'ws-testco' });
    expect([release.status, stop.status]).toEqual([403, 403]);
    expect(insertRequest).not.toHaveBeenCalled();
    expect(stopRequest).not.toHaveBeenCalled();
  });

  test('Sam, on the same board, neither sees nor stops Pat\'s request', async () => {
    await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT });
    const list = await as(2, 'get', '/api/kraken/requests?workspaceId=ws-testco');
    const stop = await as(2, 'post', `/api/kraken/requests/${REQUEST_ID}/stop`).send({ workspaceId: 'ws-testco', userId: 1 });
    expect(list.body.requests).toEqual([]);
    expect(stop.status).toBe(404);
    expect(rows.get(REQUEST_ID).status).toBe('open');
  });

  test('Pat sees her request and stops it', async () => {
    await as(1, 'post', '/api/kraken/requests').send({ workspaceId: 'ws-testco', report: REPORT });
    const list = await as(1, 'get', '/api/kraken/requests?workspaceId=ws-testco');
    expect(list.body.requests).toHaveLength(1);
    const stop = await as(1, 'post', `/api/kraken/requests/${REQUEST_ID}/stop`).send({ workspaceId: 'ws-testco' });
    expect(stop.status).toBe(200);
    expect(stop.body.request.status).toBe('stopped');
    expect((await as(1, 'post', '/api/kraken/requests/not-an-id/stop').send({ workspaceId: 'ws-testco' })).status).toBe(404);
  });
});
