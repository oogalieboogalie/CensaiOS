import { jest } from '@jest/globals';
import {
  deleteWorkspaceState,
  getWorkspaceState,
  setWorkspaceState,
} from '../server/state/clientStateStore.js';
import {
  ensurePersonalWorkspace,
  requireWorkspaceMember,
  resolveWorkspaceContext,
} from '../server/workspaces/context.js';

describe('workspace-scoped client state', () => {
  test('reads and writes canvas state by workspace id', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ value: { wins: [] }, revision: 1, updated_at: '2026-07-14T00:00:00Z' }] })
        .mockResolvedValueOnce({ rows: [{ revision: 2, updated_at: '2026-07-14T00:01:00Z' }] }),
    };

    await expect(getWorkspaceState({
      db,
      workspaceId: 'workspace-1',
    })).resolves.toEqual(expect.objectContaining({
      found: true,
      value: { wins: [] },
    }));
    await setWorkspaceState({
      db,
      workspaceId: 'workspace-1',
      value: { wins: [{ id: 'window-1' }] },
      expectedRevision: 1,
    });

    expect(db.query.mock.calls[0][1]).toEqual([
      'workspace-1',
      'homebase.workspace.v1',
    ]);
    expect(db.query.mock.calls[1][1]).toEqual([
      'workspace-1',
      'homebase.workspace.v1',
      JSON.stringify({ wins: [{ id: 'window-1' }] }),
      1,
    ]);
  });

  test('rejects users who are not workspace members', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await expect(requireWorkspaceMember(db, {
      userId: 7,
      workspaceId: 'workspace-1',
    })).rejects.toMatchObject({
      message: 'Workspace access denied',
      statusCode: 403,
    });
  });

  test('rejects a stale write without claiming persistence', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(setWorkspaceState({
      db,
      workspaceId: 'workspace-1',
      value: { wins: ['stale'] },
      expectedRevision: 3,
    })).rejects.toMatchObject({
      message: 'Workspace changed since it was loaded',
      statusCode: 409,
      code: 'workspace_revision_conflict',
    });
  });

  test('workspace deletion also rejects a stale revision', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(deleteWorkspaceState({
      db, workspaceId: 'workspace-1', expectedRevision: 2,
    })).rejects.toMatchObject({ statusCode: 409, code: 'workspace_revision_conflict' });
    await expect(deleteWorkspaceState({
      db, workspaceId: 'workspace-1', expectedRevision: 0,
    })).resolves.toEqual({ removed: false, revision: 0 });
  });

  test('creates an owned workspace only when the id does not exist', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'workspace-1', name: 'Workspace', role: 'owner' }],
        }),
    };

    await expect(resolveWorkspaceContext(db, {
      userId: 7,
      workspaceId: 'workspace-1',
      createIfMissing: true,
    })).resolves.toEqual(expect.objectContaining({
      id: 'workspace-1',
      role: 'owner',
    }));
  });

  test('does not let a non-member claim an existing workspace', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(resolveWorkspaceContext(db, {
      userId: 7,
      workspaceId: 'workspace-1',
      createIfMissing: true,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('repairs and returns the deterministic personal workspace', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{
          id: 'user-7-default', name: 'My Workspace', tenant_id: null, created_by_user_id: 7,
        }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-7-default', name: 'My Workspace', role: 'owner' }] }),
    };
    await expect(ensurePersonalWorkspace(db, 7)).resolves.toMatchObject({
      id: 'user-7-default', role: 'owner', tenantId: null,
    });
    expect(db.query.mock.calls[1][1]).toEqual(['user-7-default', 7]);
  });

  test('resolveWorkspaceContext surfaces tenantId from a workspace row with tenant_id set', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1', tenant_id: 'acme' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'workspace-1', name: 'Workspace', role: 'owner' }],
        }),
    };

    await expect(resolveWorkspaceContext(db, {
      userId: 7,
      workspaceId: 'workspace-1',
    })).resolves.toEqual({
      id: 'workspace-1',
      name: 'Workspace',
      role: 'owner',
      tenantId: 'acme',
    });
  });

  test('resolveWorkspaceContext defaults tenantId to null when the column is null', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1', tenant_id: null }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'workspace-1', name: 'Workspace', role: 'owner' }],
        }),
    };

    await expect(resolveWorkspaceContext(db, {
      userId: 7,
      workspaceId: 'workspace-1',
    })).resolves.toEqual(expect.objectContaining({
      id: 'workspace-1',
      role: 'owner',
      tenantId: null,
    }));
  });
});
