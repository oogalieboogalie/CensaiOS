import { jest } from '@jest/globals';

const requireWorkspaceMember = jest.fn();
const ensurePersonalWorkspace = jest.fn();

jest.unstable_mockModule('../server/workspaces/context.js', () => ({ ensurePersonalWorkspace, requireWorkspaceMember }));

const {
  inviteRegisteredWorkspaceMember,
  leaveWorkspaceMembership,
  listWorkspaceMembers,
} = await import('../server/workspaces/members.js');

describe('workspace human memberships', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', name: 'Launch', role: 'owner' });
    ensurePersonalWorkspace.mockResolvedValue({ id: 'user-7-default', name: 'My Workspace', role: 'owner' });
  });

  test('lists members for any authorized workspace member', async () => {
    const db = { query: jest.fn().mockResolvedValue({
      rows: [{ id: 7, email: 'owner@example.com', name: 'Owner', role: 'owner' }],
    }) };

    await expect(listWorkspaceMembers(db, {
      workspaceId: 'workspace-a', userId: 7,
    })).resolves.toMatchObject({
      workspace: { id: 'workspace-a', role: 'owner' },
      members: [{ id: 7, role: 'owner' }],
    });
    expect(requireWorkspaceMember).toHaveBeenCalledWith(db, {
      workspaceId: 'workspace-a', userId: 7,
    });
  });

  test('rejects owner self-removal without deleting anything', async () => {
    const db = { connect: jest.fn() };
    await expect(leaveWorkspaceMembership(db, {
      workspaceId: 'workspace-a', userId: 7,
    })).rejects.toMatchObject({ code: 'WORKSPACE_OWNER_CANNOT_LEAVE', statusCode: 409 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('removes a member and returns their personal workspace', async () => {
    requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', name: 'Launch', role: 'member' });
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql) => sql.startsWith('DELETE FROM workspace_members')
        ? { rows: [{ workspace_id: 'workspace-a' }] }
        : { rows: [] }),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) };
    await expect(leaveWorkspaceMembership(db, {
      workspaceId: 'workspace-a', userId: 7,
    })).resolves.toMatchObject({
      leftWorkspace: { id: 'workspace-a', role: 'member' },
      workspace: { id: 'user-7-default', role: 'owner' },
    });
    expect(ensurePersonalWorkspace).toHaveBeenCalledWith(db, 7);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('invites an existing account without downgrading an existing membership', async () => {
    const member = { id: 8, email: 'peer@example.com', name: 'Peer', role: 'member' };
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (sql.startsWith('SELECT id,email,name FROM users')) {
          return { rows: [{ id: 8, email: member.email, name: member.name }] };
        }
        if (sql.startsWith('INSERT INTO workspace_members')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM workspace_members wm JOIN users')) return { rows: [member] };
        return { rows: [] };
      }),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) };

    await expect(inviteRegisteredWorkspaceMember(db, {
      workspaceId: 'workspace-a', userId: 7, email: ' PEER@example.com ',
    })).resolves.toMatchObject({ member, alreadyMember: true });
    expect(client.query).toHaveBeenCalledWith('UPDATE workspaces SET updated_at=NOW() WHERE id=$1', ['workspace-a']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('fails clearly and rolls back when the account has not registered', async () => {
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql) => sql.startsWith('SELECT id,email,name FROM users')
        ? { rows: [] }
        : { rows: [] }),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) };

    await expect(inviteRegisteredWorkspaceMember(db, {
      workspaceId: 'workspace-a', userId: 7, email: 'missing@example.com',
    })).rejects.toMatchObject({ code: 'REGISTERED_ACCOUNT_REQUIRED', statusCode: 404 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
