import { jest } from '@jest/globals';
import request from 'supertest';

// Canvas-group goals (server/routes/agents/goals.js) through a real request.
// Made-up people: Pat (user 1) and Sam (user 2) at Testco.
//
// No per-person case: a goal row (group_goals) has only a group name, with no
// owner and no board, so there is nobody's goal for a teammate to be kept away
// from. Scoping goals needs new columns first; until then the app-wide
// sign-in guard is the only gate, and that is what case 1 checks.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const goals = [];
const getGoals = jest.fn(async (groupName) => goals.filter((goal) => goal.group_name === groupName));
const addGoal = jest.fn(async (groupName, title, description) => {
  const goal = { id: goals.length + 1, group_name: groupName, title, description: description || null, status: 'active' };
  goals.push(goal);
  return goal;
});
const updateGoalStatus = jest.fn(async (id, status) => {
  const goal = goals.find((row) => String(row.id) === String(id));
  if (goal) goal.status = status;
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
  goals.push({ id: 1, group_name: 'Testco launch', title: 'Ship the beta', description: null, status: 'active' });
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
    expect(getGoals).toHaveBeenCalledWith('Testco launch');
    expect(res.body).toEqual([expect.objectContaining({ title: 'Ship the beta' })]);
  });

  test('Pat adds a goal and marks it done', async () => {
    const added = await request(app).post('/api/goals').set('x-user-id', '1')
      .send({ groupName: 'Testco launch', title: 'Write the docs' });
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ id: 2, title: 'Write the docs' });

    const done = await request(app).patch('/api/goals/2').set('x-user-id', '1').send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(updateGoalStatus).toHaveBeenCalledWith('2', 'done');
    expect(goals[1].status).toBe('done');
  });

  test('a goal needs a group and a title, and a change needs a status', async () => {
    expect((await request(app).post('/api/goals').set('x-user-id', '1').send({ title: 'x' })).status).toBe(400);
    expect((await request(app).patch('/api/goals/1').set('x-user-id', '1').send({})).status).toBe(400);
    expect(addGoal).not.toHaveBeenCalled();
    expect(updateGoalStatus).not.toHaveBeenCalled();
  });
});
