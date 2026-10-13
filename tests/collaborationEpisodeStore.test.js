import { jest } from '@jest/globals';
import {
  listRecentCollaborationEpisodes,
  listRecentCollaborationEpisodesSafely,
  persistCollaborationEpisodes,
  persistCollaborationEpisodesSafely,
} from '../server/collaboration/episodeStore.js';

test('records meaningful episodes atomically in the existing workspace ledger', async () => {
  const client = {
    release: jest.fn(),
    query: jest.fn(async sql => String(sql).includes('INSERT INTO workspace_events')
      ? { rows: [{ id: 'episode-1' }] } : { rows: [] }),
  };
  const db = { connect: jest.fn(async () => client) };
  const episodes = await persistCollaborationEpisodes(db, {
    workspaceId: 'workspace-a', revision: 2,
    actor: { type: 'human', id: '7', label: 'Member 7' },
    previousValue: { wins: [{ id: 'doc', kind: 'doc', text: '', x: 0, y: 0 }] },
    nextValue: { wins: [{ id: 'doc', kind: 'doc', text: 'hello world!', x: 0, y: 0 }] },
  });
  expect(episodes).toHaveLength(1);
  expect(client.query.mock.calls.map(([sql]) => String(sql))).toEqual([
    'BEGIN', expect.stringContaining('INSERT INTO workspace_events'), 'COMMIT',
  ]);
  const insert = client.query.mock.calls[1];
  expect(insert[1]).toEqual(expect.arrayContaining([
    'workspace-a', 'collaboration.window.edited', 'user', '7',
  ]));
  expect(client.release).toHaveBeenCalled();
});

test('recall is workspace-scoped, revision-ordered, and bounded', async () => {
  const db = { query: jest.fn(async () => ({ rows: [{
    event_type: 'collaboration.window.moved', actor_kind: 'user', actor_id: '8',
    payload: { revision: 3, summary: 'Member 8 moved Plan.md', windowId: 'doc' },
    created_at: '2026-07-15T00:00:00Z',
  }] })) };
  await expect(listRecentCollaborationEpisodes(db, {
    workspaceId: 'workspace-a', limit: 999,
  })).resolves.toEqual([expect.objectContaining({
    revision: 3, actor: { kind: 'user', id: '8' }, windowId: 'doc',
  })]);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('workspace_id=$1'), [
    'workspace-a', 24,
  ]);
  expect(db.query.mock.calls[0][0]).toContain("payload->>'revision'");
});

test('recall fails soft when the operational ledger is unavailable', async () => {
  const db = { query: jest.fn(async () => { throw new Error('ledger unavailable'); }) };
  await expect(listRecentCollaborationEpisodesSafely(db, {
    workspaceId: 'workspace-a',
  })).resolves.toEqual([]);
});

test('recording rolls back atomically and fails soft after the canvas commit', async () => {
  const client = {
    release: jest.fn(),
    query: jest.fn(async sql => {
      if (String(sql).includes('INSERT INTO workspace_events')) throw new Error('ledger unavailable');
      return { rows: [] };
    }),
  };
  const db = { connect: jest.fn(async () => client) };
  const input = {
    workspaceId: 'workspace-a', revision: 2,
    actor: { type: 'human', id: '7', label: 'Member 7' },
    previousValue: { wins: [] },
    nextValue: { wins: [{ id: 'doc', kind: 'doc' }] },
  };
  await expect(persistCollaborationEpisodes(db, input)).rejects.toThrow('ledger unavailable');
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  await expect(persistCollaborationEpisodesSafely(db, input)).resolves.toEqual([]);
  expect(client.release).toHaveBeenCalledTimes(2);
});
