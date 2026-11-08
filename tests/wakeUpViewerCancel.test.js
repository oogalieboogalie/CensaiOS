import { jest } from '@jest/globals';

// A viewer can look at a board but not stop what runs on it.
const requireWorkspaceMember = jest.fn(async (_db, { roles }) => {
  if (roles && !roles.includes('viewer')) {
    throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
  }
  return { role: 'viewer' };
});
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));

const { handleWakeUpTool } = await import('../server/tools/handlers/wakeUps.js');

test('a viewer cannot cancel a wake-up', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
  const out = await handleWakeUpTool('censai', 'cancel_wake_up', { id: 'abc' }, { workspaceId: 'ws-1', userId: 9 }, db);
  expect(out).toMatch(/does not allow/);
  expect(db.query.mock.calls.some(([sql]) => /DELETE/i.test(String(sql)))).toBe(false);
});
