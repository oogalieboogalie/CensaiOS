import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// A canvas group's goals and milestones are asked for by the group's name
// (src/components/group/useGroupData.js). The request log keeps the route and
// a goal's or milestone's id, never the group's name. Made-up names for Pat Example.
const GROUP = 'Made-up Garden Plans';
const NAMED = /made-up|garden/i;
const GOAL = '00000000-0000-4000-8000-000000000001';
const MILESTONE = '00000000-0000-4000-8000-000000000002';

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getGoals: jest.fn(async () => []),
  addGoal: jest.fn(async (userId, groupName, title) => ({ id: GOAL, group_name: groupName, title })),
  updateGoalStatus: jest.fn(async () => true),
  getMilestones: jest.fn(async () => []),
  addMilestone: jest.fn(async (userId, groupName, title) => ({ id: MILESTONE, group_name: groupName, title })),
  completeMilestone: jest.fn(async () => true),
}));

const { onLogRecord, redactUrl } = await import('../server/logger.js');
const { requestLogger } = await import('../server/boot/requestLog.js');
const { goalsRouter } = await import('../server/routes/agents/goals.js');
const { milestonesRouter } = await import('../server/routes/agents/milestones.js');

const app = express();
app.use(express.json());
app.use(requestLogger());
app.use((req, _res, next) => { req.session = { userId: 1 }; next(); });
app.use('/api', goalsRouter, milestonesRouter);

const records = [];
onLogRecord((r) => records.push(r));

test('the request log keeps a group\'s goals and milestones routes and ids, never the group\'s name', async () => {
  const name = encodeURIComponent(GROUP);
  for (const [method, url, body] of [
    ['get', `/api/goals/${name}`],
    ['get', `/api/milestones/${name}`],
    ['post', '/api/goals', { groupName: GROUP, title: 'Plant the made-up beans' }],
    ['post', '/api/milestones', { groupName: GROUP, title: 'Made-up first harvest' }],
    ['patch', `/api/goals/${GOAL}`, { status: 'done' }],
    ['patch', `/api/milestones/${MILESTONE}/complete`],
  ]) expect([url, (await request(app)[method](url).send(body)).status]).toEqual([url, 200]);

  expect(records.filter((r) => r.namespace === 'http').map((r) => r.message.replace(/ \d+ms$/, ''))).toEqual([
    'GET /api/goals/[redacted] 200',
    'GET /api/milestones/[redacted] 200',
    'POST /api/goals 200',
    'POST /api/milestones 200',
    `PATCH /api/goals/${GOAL} 200`,
    `PATCH /api/milestones/${MILESTONE}/complete 200`,
  ]);
  expect(JSON.stringify(records)).not.toMatch(NAMED);
});

test('an address hides a group\'s name and keeps a goal\'s or milestone\'s id', () => {
  expect(redactUrl('/api/goals/Made-up%20Garden%20Plans')).toBe('/api/goals/[redacted]');
  expect(redactUrl('/API/Milestones/made-up?x=1')).toBe('/API/Milestones/[redacted]?x=[redacted]');
  expect(redactUrl(`/api/milestones/${MILESTONE}/complete`)).toBe(`/api/milestones/${MILESTONE}/complete`);
  // An older install's whole-number id is hidden too; the route's own line names it when it refuses.
  expect(redactUrl('/api/milestones/42/complete')).toBe('/api/milestones/[redacted]/complete');
  for (const plain of ['/api/goals', '/api/milestones', '/api/sub-agents']) expect(redactUrl(plain)).toBe(plain);
});
