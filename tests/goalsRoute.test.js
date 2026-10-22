import { jest } from '@jest/globals';
import request from 'supertest';

// Canvas-group goals (server/routes/agents/goals.js) through a real request.
// Made-up people: Pat (user 1) and Sam (user 2) at Testco.
//
// Each goal belongs to the person who made it (owner_user_id, added by
// docker/091-group-goal-owners.sql), so Sam never sees or changes Pat's goals.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const goals = [];
const PAT_GOAL = '00000000-0000-4000-8000-000000000001';
const NEW_GOAL = '00000000-0000-4000-8000-000000000002';
const getGoals = jest.fn(async (userId, groupName) => goals
  .filter((goal) => goal.owner_user_id === userId && goal.group_name === groupName));
const addGoal = jest.fn(async (userId, groupName, title, description) => {
  const goal = { id: NEW_GOAL, owner_user_id: userId, group_name: groupName, title, description: description || null, status: 'active' };
  goals.push(goal);
  return goal;
});
const updateGoalStatus = jest.fn(async (userId, id, status) => {
  const goal = goals.find((row) => row.id === id && row.owner_user_id === userId);
  if (goal) goal.status = status;
  return Boolean(goal);
});
jest.unstable_mockModule('../server/memory.js', () => ({ getGoals, addGoal, updateGoalStatus }));

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { goalsRouter } = await import('../server/routes/agents/goals.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId, userEmail: userId === 1 ? 'pat@example.com' : 'sam@example.com' } : {};
  next();
});
app.use('/api', requireAuthorizedSession, goalsRouter);

beforeEach(() => {
  goals.length = 0;
  goals.push({ id: PAT_GOAL, owner_user_id: 1, group_name: 'Testco launch', title: 'Ship the beta', description: null, status: 'active' });
  jest.clearAllMocks();
});

describe('goals route', () => {
  test('signed out is refused before any goal is read or written', async () => {
    const read = await request(app).get('/api/goals/Testco%20launch');
    const write = await request(app).post('/api/goals').send({ groupName: 'Testco launch', title: 'x' });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(getGoals).not.toHaveBeenCalled();
    expect(addGoal).not.toHaveBeenCalled();
  });

  test('Pat reads the goals of a group', async () => {
    const res = await request(app).get('/api/goals/Testco%20launch').set('x-user-id', '1');
    expect(res.status).toBe(200);
    expect(getGoals).toHaveBeenCalledWith(1, 'Testco launch');
    expect(res.body).toEqual([expect.objectContaining({ title: 'Ship the beta' })]);
  });

  test('Pat adds a goal and marks it done', async () => {
    const added = await request(app).post('/api/goals').set('x-user-id', '1')
      .send({ groupName: 'Testco launch', title: 'Write the docs' });
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ id: NEW_GOAL, owner_user_id: 1, title: 'Write the docs' });

    const done = await request(app).patch(`/api/goals/${NEW_GOAL}`).set('x-user-id', '1').send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(updateGoalStatus).toHaveBeenCalledWith(1, NEW_GOAL, 'done');
    expect(goals[1].status).toBe('done');
  });

  test('a goal needs a group and a title, and a change needs a status', async () => {
    expect((await request(app).post('/api/goals').set('x-user-id', '1').send({ title: 'x' })).status).toBe(400);
    expect((await request(app).patch(`/api/goals/${PAT_GOAL}`).set('x-user-id', '1').send({})).status).toBe(400);
    expect(addGoal).not.toHaveBeenCalled();
    expect(updateGoalStatus).not.toHaveBeenCalled();
  });

  test('Sam, a teammate, neither sees nor changes Pat\'s goals', async () => {
    const read = await request(app).get('/api/goals/Testco%20launch').set('x-user-id', '2');
    expect(read.status).toBe(200);
    expect(read.body).toEqual([]);

    const change = await request(app).patch(`/api/goals/${PAT_GOAL}`).set('x-user-id', '2').send({ status: 'done' });
    expect(change.status).toBe(404);
    expect(goals[0].status).toBe('active');
  });

  test('a made-up goal id is refused without asking the database', async () => {
    const res = await request(app).patch('/api/goals/not-a-goal').set('x-user-id', '1').send({ status: 'done' });
    expect(res.status).toBe(404);
    expect(updateGoalStatus).not.toHaveBeenCalled();
  });
});
