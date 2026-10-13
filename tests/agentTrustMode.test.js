import { jest } from '@jest/globals';
import { agentIsTrusted, readTrustMode, setTrustMode } from '../server/approvals/trustMode.js';
import { withWaitingFlag, toolCallOk } from '../server/routes/chat/toolOutcome.js';
import { describeToolEvent } from '../src/components/chat/toolActivity.js';

function fakeDb(rows = []) {
  const table = new Map(rows.map(r => [r.agent_id, r.trusted]));
  return {
    table,
    query: jest.fn(async (sql, params) => {
      if (sql.startsWith('SELECT')) return { rows: [...table].map(([agent_id, trusted]) => ({ agent_id, trusted })) };
      if (sql.startsWith('DELETE')) table.delete(params[1]);
      if (sql.startsWith('INSERT')) table.set(params[1], params[2]);
      return { rows: [] };
    }),
  };
}

test('Trust mode is on for a board nobody has touched', async () => {
  const db = fakeDb();
  await expect(readTrustMode(db, 'board-1')).resolves.toEqual({ board: true, agents: {} });
  await expect(agentIsTrusted(db, { workspaceId: 'board-1', agentId: 'atlas' })).resolves.toBe(true);
});

test('the board switch turns asking back on, and one agent can differ', async () => {
  const db = fakeDb();
  await setTrustMode(db, { workspaceId: 'b', trusted: false, userId: 1 });
  await expect(agentIsTrusted(db, { workspaceId: 'b', agentId: 'atlas' })).resolves.toBe(false);
  await setTrustMode(db, { workspaceId: 'b', agentId: 'Atlas', trusted: true, userId: 1 });
  await expect(agentIsTrusted(db, { workspaceId: 'b', agentId: 'atlas' })).resolves.toBe(true);
  await expect(agentIsTrusted(db, { workspaceId: 'b', agentId: 'nexus' })).resolves.toBe(false);
  await setTrustMode(db, { workspaceId: 'b', agentId: 'atlas', trusted: null, userId: 1 });
  await expect(agentIsTrusted(db, { workspaceId: 'b', agentId: 'atlas' })).resolves.toBe(false);
});

test('no board means nothing is trusted, and odd agent names are refused', async () => {
  await expect(agentIsTrusted(fakeDb(), { workspaceId: '', agentId: 'atlas' })).resolves.toBe(false);
  await expect(setTrustMode(fakeDb(), { workspaceId: 'b', agentId: '../x', trusted: true }))
    .rejects.toMatchObject({ statusCode: 400 });
});

test('an action waiting for an OK reads as waiting, not failed', () => {
  const result = 'APPROVAL_REQUIRED: abc is pending owner/admin review. No action was executed.';
  expect(toolCallOk(result)).toBe(false);
  const summary = withWaitingFlag({ path: 'src/App.jsx' }, result);
  expect(summary).toEqual({ path: 'src/App.jsx', waiting: true });
  expect(withWaitingFlag({ path: 'a' }, 'Error: nope')).toEqual({ path: 'a' });
  const card = describeToolEvent({ tool: 'project_edit', ok: false, summary }, { past: true });
  expect(card).toMatchObject({ waiting: true, label: 'Editing App.jsx' });
});
