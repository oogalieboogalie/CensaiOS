import { jest } from '@jest/globals';
import request from 'supertest';

// Censai's plans (server/routes/agents/censaiPlans.js) through a real
// request. Made-up people at Testco: Pat (user 1) owns the board and one
// plan, Sam (user 2) is a member of the same board.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const MEMBERS = { 'ws-testco': { 1: 'owner', 2: 'member' } };
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async (_db, { userId, workspaceId }) => {
    const role = MEMBERS[workspaceId]?.[Number(userId)];
    if (!role) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    return { id: workspaceId, role };
  }),
}));

const PLAN_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const plans = new Map();
const owns = ({ id, workspaceId, userId }) => {
  const row = plans.get(id);
  return row && row.workspace_id === workspaceId && row.user_id === userId ? row : null;
};
const listPlans = jest.fn(async (_db, { workspaceId, userId }) => [...plans.values()]
  .filter((row) => row.workspace_id === workspaceId && row.user_id === userId));
jest.unstable_mockModule('../server/censaiOrchestrator/store.js', () => ({
  listPlans,
  getPlan: jest.fn(async (_db, args) => owns(args)),
  claimReport: jest.fn(async (_db, args) => Boolean(owns(args))),
}));
const stopPlan = jest.fn(async (args) => {
  const row = owns(args);
  if (row) row.status = 'stopped';
  return row;
});
jest.unstable_mockModule('../server/censaiOrchestrator/runner.js', () => ({ recoverOnce: jest.fn(async () => {}), stopPlan }));

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { censaiPlansRouter } = await import('../server/routes/agents/censaiPlans.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api', requireAuthorizedSession, censaiPlansRouter);

beforeEach(() => {
  plans.clear();
  plans.set(PLAN_ID, {
    id: PLAN_ID, workspace_id: 'ws-testco', user_id: 1, goal: 'Tidy the Testco board', status: 'running', jobs: [],
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
  });
  jest.clearAllMocks();
});

describe('censai plans route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).get('/api/censai/plans?workspaceId=ws-testco')).status).toBe(401);
    expect((await request(app).post(`/api/censai/plans/${PLAN_ID}/stop`).send({ workspaceId: 'ws-testco' })).status).toBe(401);
    expect(listPlans).not.toHaveBeenCalled();
    expect(stopPlan).not.toHaveBeenCalled();
  });

  test('Pat lists her plans on the board', async () => {
    const res = await request(app).get('/api/censai/plans?workspaceId=ws-testco').set('x-user-id', '1');
    expect(res.status).toBe(200);
    expect(res.body.plans).toEqual([expect.objectContaining({ id: PLAN_ID, goal: 'Tidy the Testco board', status: 'running' })]);
  });

  test('Pat stops her plan', async () => {
    const res = await request(app).post(`/api/censai/plans/${PLAN_ID}/stop`).set('x-user-id', '1').send({ workspaceId: 'ws-testco' });
    expect(res.status).toBe(200);
    expect(res.body.plan.status).toBe('stopped');
    expect(stopPlan).toHaveBeenCalledWith({ id: PLAN_ID, workspaceId: 'ws-testco', userId: 1 });
  });

  test('Sam, on the same board, neither sees nor stops nor marks Pat\'s plan', async () => {
    const list = await request(app).get('/api/censai/plans?workspaceId=ws-testco').set('x-user-id', '2');
    expect(list.status).toBe(200);
    expect(list.body.plans).toEqual([]);

    const stop = await request(app).post(`/api/censai/plans/${PLAN_ID}/stop`).set('x-user-id', '2')
      .send({ workspaceId: 'ws-testco', userId: 1 });
    const told = await request(app).post(`/api/censai/plans/${PLAN_ID}/reported`).set('x-user-id', '2')
      .send({ workspaceId: 'ws-testco' });
    expect([stop.status, told.status]).toEqual([404, 404]);
    expect(stopPlan).toHaveBeenCalledWith({ id: PLAN_ID, workspaceId: 'ws-testco', userId: 2 });
    expect(plans.get(PLAN_ID).status).toBe('running');
  });
});
