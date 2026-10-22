import { jest } from '@jest/globals';
import request from 'supertest';

// Canvas-group milestones (server/routes/agents/milestones.js) through a real
// request. Made-up people: Pat (user 1) and Sam (user 2) at Testco. Each
// milestone belongs to the person who made it.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const PAT_MILESTONE = '00000000-0000-4000-8000-0000000000a1';
const rows = [];
const getMilestones = jest.fn(async (userId, groupName) => rows
  .filter((row) => row.owner_user_id === userId && row.group_name === groupName));
const addMilestone = jest.fn(async (userId, groupName, title) => {
  const row = { id: '00000000-0000-4000-8000-0000000000a2', owner_user_id: userId, group_name: groupName, title, completed: false };
  rows.push(row);
  return row;
});
const completeMilestone = jest.fn(async (userId, id) => {
  const row = rows.find((r) => r.id === id && r.owner_user_id === userId);
  if (row) row.completed = true;
  return Boolean(row);
});
jest.unstable_mockModule('../server/memory.js', () => ({ getMilestones, addMilestone, completeMilestone }));

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { milestonesRouter } = await import('../server/routes/agents/milestones.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api', requireAuthorizedSession, milestonesRouter);

beforeEach(() => {
  rows.length = 0;
  rows.push({ id: PAT_MILESTONE, owner_user_id: 1, group_name: 'Testco launch', title: 'Beta out', completed: false });
  jest.clearAllMocks();
});

describe('milestones route', () => {
  test('Pat reads, adds and completes their own milestones', async () => {
    const read = await request(app).get('/api/milestones/Testco%20launch').set('x-user-id', '1');
    expect(read.body).toEqual([expect.objectContaining({ title: 'Beta out' })]);
    const added = await request(app).post('/api/milestones').set('x-user-id', '1')
      .send({ groupName: 'Testco launch', title: 'Docs out' });
    expect(added.body).toMatchObject({ owner_user_id: 1, title: 'Docs out' });
    const done = await request(app).patch(`/api/milestones/${PAT_MILESTONE}/complete`).set('x-user-id', '1');
    expect(done.status).toBe(200);
    expect(rows[0].completed).toBe(true);
  });

  test('Sam, a teammate, neither sees nor completes Pat\'s milestone', async () => {
    const read = await request(app).get('/api/milestones/Testco%20launch').set('x-user-id', '2');
    expect(read.body).toEqual([]);
    const done = await request(app).patch(`/api/milestones/${PAT_MILESTONE}/complete`).set('x-user-id', '2');
    expect(done.status).toBe(404);
    expect(rows[0].completed).toBe(false);
  });

  test('a made-up milestone id is refused without asking the database', async () => {
    const res = await request(app).patch('/api/milestones/nope/complete').set('x-user-id', '1');
    expect(res.status).toBe(404);
    expect(completeMilestone).not.toHaveBeenCalled();
  });
});
