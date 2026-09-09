import { jest } from '@jest/globals';
import {
  appendCollaborativeWindowText,
  listCollaborativeCanvasWindows,
  listCanvasWindowIndex,
  spawnCanvasWindow,
} from '../server/collaboration/workspaceMutations.js';
import {
  __resetWorkspaceHubForTests,
  joinWorkspaceClient,
} from '../server/collaboration/workspaceHub.js';

function database(initialValue, initialRevision = 2) {
  let value = structuredClone(initialValue);
  let revision = initialRevision;
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('SELECT value, revision')) return { rows: [{ value, revision }] };
      if (statement.includes('UPDATE workspace_client_state')) {
        value = JSON.parse(params[2]);
        revision += 1;
        return { rows: [{ revision, updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    }),
  };
  return {
    db: {
      connect: jest.fn(async () => client),
      query: jest.fn(async () => ({ rows: [{ value, revision }] })),
    },
    client,
    current: () => ({ value, revision }),
  };
}

beforeEach(() => __resetWorkspaceHubForTests());
afterEach(() => __resetWorkspaceHubForTests());

test('lists only writable shared canvas windows', async () => {
  const fixture = database({ wins: [
    { id: 'doc-1', kind: 'doc', fileName: 'Launch.md', text: '' },
    { id: 'term-1', kind: 'terminal', title: 'Terminal' },
  ] });
  await expect(listCollaborativeCanvasWindows(fixture.db, 'workspace-a')).resolves.toEqual({
    revision: 2,
    windows: [{ id: 'doc-1', kind: 'doc', label: 'Launch.md' }],
  });
});

test('agent append is serialized, revisioned, attributed, and broadcast after commit', async () => {
  const fixture = database({ wins: [
    { id: 'doc-1', kind: 'doc', fileName: 'Launch.md', text: 'Human draft' },
  ] });
  const send = jest.fn();
  joinWorkspaceClient({
    workspaceId: 'workspace-a', clientId: 'watcher',
    actor: { type: 'human', id: '7', label: 'Member 7' }, send,
  });

  const result = await appendCollaborativeWindowText(fixture.db, {
    workspaceId: 'workspace-a', windowId: 'doc-1', agentId: 'censai',
    content: 'Agent contribution',
  });

  expect(result.revision).toBe(3);
  expect(fixture.current().value.wins[0].text).toBe('Human draft\nAgent contribution');
  expect(fixture.client.query).toHaveBeenCalledWith('COMMIT');
  expect(fixture.client.query.mock.calls.some(([sql]) => (
    String(sql).includes('INSERT INTO workspace_events')
  ))).toBe(true);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    type: 'workspace.committed', revision: 3,
    actor: { type: 'agent', id: 'censai', label: 'Censai' },
    activity: expect.objectContaining({ windowId: 'doc-1' }),
  }));
});

test('agent append rejects unsupported windows without committing', async () => {
  const fixture = database({ wins: [{ id: 'term-1', kind: 'terminal' }] });
  await expect(appendCollaborativeWindowText(fixture.db, {
    workspaceId: 'workspace-a', windowId: 'term-1', agentId: 'atlas', content: 'nope',
  })).rejects.toMatchObject({ code: 'CANVAS_WINDOW_NOT_WRITABLE', statusCode: 422 });
  expect(fixture.client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(fixture.current().revision).toBe(2);
});

test('agent spawn places a doc window next to the anchor and broadcasts it', async () => {
  const fixture = database({ wins: [
    { id: 'chat-1', kind: 'chat', title: 'Chat', x: 100, y: 200, w: 360, h: 420 },
  ] });
  const send = jest.fn();
  joinWorkspaceClient({
    workspaceId: 'workspace-a', clientId: 'watcher',
    actor: { type: 'human', id: '7', label: 'Member 7' }, send,
  });

  const result = await spawnCanvasWindow(fixture.db, {
    workspaceId: 'workspace-a', agentId: 'atlas',
    kind: 'doc', title: 'Atlas notes', content: 'Hello canvas',
    nearWindowId: 'chat-1',
  });

  expect(result.revision).toBe(3);
  expect(result.window).toMatchObject({
    kind: 'doc', title: 'Atlas notes', text: 'Hello canvas',
    x: 500, y: 200, w: 560, h: 460,
  });
  expect(result.window.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fixture.current().value.wins).toHaveLength(2);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    type: 'workspace.committed', revision: 3,
    activity: expect.objectContaining({ kind: 'canvas.window.spawned', windowId: result.window.id }),
  }));
});

test('agent spawn rejects bad kinds without committing', async () => {
  const fixture = database({ wins: [] });
  await expect(spawnCanvasWindow(fixture.db, {
    workspaceId: 'workspace-a', agentId: 'atlas',
    kind: 'terminal', title: 'Nope',
  })).rejects.toMatchObject({ code: 'INVALID_CANVAS_WINDOW_KIND' });
  expect(fixture.client.query).not.toHaveBeenCalled();
  expect(fixture.current().revision).toBe(2);
});

test('window index paginates alphabetically with a query filter', async () => {
  const fixture = database({ wins: [
    { id: 'c1', kind: 'chat', title: 'Zulu chat' },
    { id: 'd1', kind: 'doc', fileName: 'Alpha notes', text: '' },
    { id: 'd2', kind: 'doc', fileName: 'Alpha plan', text: '' },
    { id: 't1', kind: 'terminal', title: 'Term' },
  ] });
  const first = await listCanvasWindowIndex(fixture.db, 'workspace-a', { perPage: 2 });
  expect(first.total).toBe(4);
  expect(first.windows.map((w) => w.label)).toEqual(['Alpha notes', 'Alpha plan']);
  expect(first.page).toBe(1);

  const second = await listCanvasWindowIndex(fixture.db, 'workspace-a', { perPage: 2, page: 2 });
  expect(second.windows.map((w) => w.label)).toEqual(['Term', 'Zulu chat']);

  const filtered = await listCanvasWindowIndex(fixture.db, 'workspace-a', { query: 'alpha' });
  expect(filtered.total).toBe(2);
});
