import { jest } from '@jest/globals';
import fs from 'node:fs';

// The goals and milestones data layer (server/memory/milestones.js) asks the
// database only for the asking person's rows, and the setup file that adds the
// owner column can run twice.

const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
const store = await import('../server/memory/milestones.js');

beforeEach(() => query.mockClear());

test.each([
  ['getGoals', [2, 'Testco launch']],
  ['updateGoalStatus', [2, 'some-id', 'done']],
  ['getMilestones', [2, 'Testco launch']],
  ['completeMilestone', [2, 'some-id']],
])('%s only touches the asking person\'s rows', async (name, args) => {
  await store[name](...args);
  const [sql, params] = query.mock.calls[0];
  expect(sql).toMatch(/owner_user_id = \$\d/);
  expect(params).toContain(2);
});

test('a change that matched no row of yours says so', async () => {
  expect(await store.updateGoalStatus(2, 'some-id', 'done')).toBe(false);
  expect(await store.completeMilestone(2, 'some-id')).toBe(false);
});

test('new goals and milestones are saved with their owner', async () => {
  await store.addGoal(1, 'Testco launch', 'Ship');
  await store.addMilestone(1, 'Testco launch', 'Beta');
  for (const [sql, params] of query.mock.calls) {
    expect(sql).toMatch(/INSERT INTO group_\w+ \(owner_user_id,/);
    expect(params[0]).toBe(1);
  }
});

test('the setup file only adds, never drops, and is safe to run twice', () => {
  const sql = fs.readFileSync('docker/091-group-goal-owners.sql', 'utf8');
  expect(sql).not.toMatch(/\bDROP\b/i);
  for (const line of sql.split('\n').filter((l) => /ADD COLUMN|CREATE INDEX/.test(l))) {
    expect(line).toMatch(/IF NOT EXISTS/);
  }
});
