import { jest } from '@jest/globals';
import {
  safeFastForwardProject,
  syncPulledTodoArtifacts,
} from '../server/operational-intelligence/localPull.js';

function gitRunnerFor(map, calls = []) {
  return async (_cwd, args) => {
    const key = args.join(' ');
    calls.push(key);
    const value = map[key];
    if (!value) return { ok: false, stdout: '', stderr: `unexpected git ${key}`, exitCode: 1 };
    const response = typeof value === 'function' ? value(calls) : value;
    return { stdout: '', stderr: '', exitCode: response.ok === false ? 1 : 0, ...response };
  };
}

describe('operational local fast-forward sync', () => {
  test('safeFastForwardProject refuses dirty worktrees before fetching', async () => {
    const calls = [];
    const result = await safeFastForwardProject(
      { path: 'C:/repo' },
      {
        gitRunner: gitRunnerFor({
          'rev-parse --show-toplevel': { ok: true, stdout: 'C:/repo\n' },
          'status --porcelain': { ok: true, stdout: ' M src/app.js\n' },
        }, calls),
      }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 'blocked',
      reason: 'dirty_worktree',
    }));
    expect(calls).not.toContain('fetch --prune origin');
  });

  test('safeFastForwardProject fetches and merges only when fast-forwardable', async () => {
    const calls = [];
    const result = await safeFastForwardProject(
      { path: 'C:/repo' },
      {
        gitRunner: gitRunnerFor({
          'rev-parse --show-toplevel': { ok: true, stdout: 'C:/repo\n' },
          'status --porcelain': { ok: true, stdout: '' },
          'rev-parse HEAD': (seen) => ({ ok: true, stdout: seen.includes('merge --ff-only origin/main') ? 'bbb\n' : 'aaa\n' }),
          'branch --show-current': { ok: true, stdout: 'main\n' },
          'fetch --prune origin': { ok: true, stdout: '' },
          'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: true, stdout: 'origin/main\n' },
          'rev-parse origin/main': { ok: true, stdout: 'bbb\n' },
          'merge-base --is-ancestor aaa origin/main': { ok: true, stdout: '' },
          'merge-base --is-ancestor origin/main HEAD': { ok: false, stdout: '' },
          'merge --ff-only origin/main': { ok: true, stdout: 'Fast-forward\n' },
        }, calls),
      }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: 'pulled',
      branch: 'main',
      upstream: 'origin/main',
      beforeSha: 'aaa',
      afterSha: 'bbb',
    }));
    expect(calls).toContain('merge --ff-only origin/main');
  });

  test('syncPulledTodoArtifacts marks pull-required merged todos as pulled', async () => {
    let updatedData = null;
    const calls = [];
    const db = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes("data->>'implementationStatus' = 'merged'")) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              data: { text: 'Ship it', implementationStatus: 'merged', pullRequired: true },
            }],
          };
        }
        if (sql.includes('UPDATE artifacts SET data')) {
          updatedData = JSON.parse(params[0]);
          return { rows: [{ id: 'todo-1', workspace_id: 'workspace-1', data: updatedData }] };
        }
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
        return { rows: [] };
      },
    };

    const result = await syncPulledTodoArtifacts(db, {
      ok: true,
      status: 'pulled',
      branch: 'main',
      afterSha: 'bbb',
    }, { workspaceId: 'workspace-1' });

    expect(result).toHaveLength(1);
    expect(updatedData).toEqual(expect.objectContaining({
      implementationStatus: 'pulled',
      pullRequired: false,
      pulledSha: 'bbb',
    }));
    expect(calls.some(call => call.params.includes('todo.implementation.pulled'))).toBe(true);
    const artifactRead = calls.find(call => call.sql.includes("data->>'implementationStatus'"));
    expect(artifactRead.sql).toMatch(/workspace_id = \$1/);
    expect(artifactRead.params).toEqual(['workspace-1']);
  });

  test('syncPulledTodoArtifacts requires a workspace before reading task artifacts', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await expect(syncPulledTodoArtifacts(db, {
      ok: true, status: 'pulled', afterSha: 'bbb',
    })).rejects.toThrow('workspaceId is required');

    expect(db.query.mock.calls.some(([sql]) => sql.includes("data->>'implementationStatus'"))).toBe(false);
  });
});
