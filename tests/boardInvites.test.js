import { jest } from '@jest/globals';

const requireWorkspaceMember = jest.fn();
const inviteRegisteredWorkspaceMember = jest.fn();

jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/workspaces/members.js', () => ({
  inviteRegisteredWorkspaceMember,
  WORKSPACE_MEMBER_MANAGE_ROLES: ['owner', 'admin'],
}));

const store = await import('../server/invites/store.js');
const { inviteReport } = await import('../server/invites/inboxSource.js');
const { errorItem } = await import('../src/lib/inbox/errorItem.js');

const NOW = Date.parse('2026-10-18T21:00:00Z');
const notRegistered = () => Object.assign(new Error('not registered'), { code: 'REGISTERED_ACCOUNT_REQUIRED', statusCode: 404 });

describe('board invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireWorkspaceMember.mockResolvedValue({ id: 'board-a', name: 'Family board', role: 'owner' });
  });

  test('an email with an account joins the board and gets one waiting invite', async () => {
    inviteRegisteredWorkspaceMember.mockResolvedValue({
      workspace: { id: 'board-a' }, member: { id: 8, name: 'Jo', email: 'jo@example.com' }, alreadyMember: false,
    });
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const result = await store.inviteToBoard(db, { workspaceId: 'board-a', userId: 7, email: ' jo@example.com ' });
    expect(result).toMatchObject({ kind: 'account', notified: true, member: { id: 8 } });
    expect(inviteRegisteredWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'board-a', userId: 7, email: 'jo@example.com' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO board_invites[\s\S]*ON CONFLICT/);
    expect(params.slice(1)).toEqual(['board-a', 7, 8]);
  });

  test('inviting yourself sends nothing', async () => {
    inviteRegisteredWorkspaceMember.mockResolvedValue({ workspace: { id: 'board-a' }, member: { id: 7 }, alreadyMember: true });
    const db = { query: jest.fn() };
    const result = await store.inviteToBoard(db, { workspaceId: 'board-a', userId: 7, email: 'me@example.com' });
    expect(result.notified).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('no account yet makes a one-time join link; only its hash is stored', async () => {
    inviteRegisteredWorkspaceMember.mockRejectedValue(notRegistered());
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const result = await store.inviteToBoard(db, { workspaceId: 'board-a', userId: 7, email: 'sam@example.com', allowJoinLinks: true, now: NOW });
    expect(result.kind).toBe('link');
    expect(store.isJoinCode(result.code)).toBe(true);
    expect(result.expiresAt).toBe('2026-10-25T21:00:00.000Z');
    const params = db.query.mock.calls[0][1];
    expect(params).toContain(store.hashCode(result.code));
    expect(params).not.toContain(result.code);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'board-a', userId: 7, roles: ['owner', 'admin'] });
  });

  test('join links are refused where people sign in with their own email', async () => {
    inviteRegisteredWorkspaceMember.mockRejectedValue(notRegistered());
    const db = { query: jest.fn() };
    await expect(store.inviteToBoard(db, { workspaceId: 'board-a', userId: 7, email: 'sam@example.com' }))
      .rejects.toMatchObject({ code: 'REGISTERED_ACCOUNT_REQUIRED' });
    await expect(store.inviteToBoard(db, { workspaceId: 'board-a', userId: 7 }))
      .rejects.toMatchObject({ code: 'JOIN_LINKS_OFF', statusCode: 409 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('a member who is not owner or admin cannot make a link', async () => {
    requireWorkspaceMember.mockRejectedValue(Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 }));
    const db = { query: jest.fn() };
    await expect(store.inviteToBoard(db, { workspaceId: 'board-a', userId: 9, allowJoinLinks: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('lists waiting invites with plain names', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [
      { id: 'i1', workspace_id: 'board-a', created_at: new Date(NOW), board_name: 'Family board', by_name: 'Alex', by_email: 'a@x' },
      { id: 'i2', workspace_id: 'board-b', created_at: new Date(NOW), board_name: null, by_name: null, by_email: 'kim@x' },
    ] }) };
    expect(await store.listMyInvites(db, 8)).toEqual([
      { id: 'i1', workspaceId: 'board-a', boardName: 'Family board', byName: 'Alex', createdAt: '2026-10-18T21:00:00.000Z' },
      { id: 'i2', workspaceId: 'board-b', boardName: 'a board', byName: 'kim', createdAt: '2026-10-18T21:00:00.000Z' },
    ]);
  });

  test('only the invited person can mark their invite', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await store.markInvite(db, { id: 'i1', userId: 99, status: 'opened' })).toBeNull();
    expect(db.query.mock.calls[0][1]).toEqual(['i1', 99, 'opened']);
    await expect(store.markInvite(db, { id: 'i1', userId: 8, status: 'used' })).rejects.toThrow('Unknown invite step.');
  });

  test('a join link previews until it is used or runs out', async () => {
    const code = 'a'.repeat(32);
    const row = { status: 'pending', expires_at: new Date(NOW + 1000), board_name: 'Family board', by_name: 'Alex' };
    const db = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    expect(await store.previewJoinCode(db, code, { now: NOW })).toEqual({ boardName: 'Family board', byName: 'Alex' });
    expect(await store.previewJoinCode(db, code, { now: NOW + 2000 })).toBeNull();
    db.query.mockResolvedValue({ rows: [{ ...row, status: 'used' }] });
    expect(await store.previewJoinCode(db, code, { now: NOW })).toBeNull();
    expect(await store.previewJoinCode(db, 'short', { now: NOW })).toBeNull();
  });

  function redeemDb(invite) {
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (sql.startsWith('SELECT id, workspace_id')) return { rows: invite ? [invite] : [] };
        if (sql.startsWith('INSERT INTO users')) return { rows: [{ id: 12, email: 'sam.x@invited', name: 'Sam', role: 'user' }] };
        return { rows: [], rowCount: 1 };
      }),
    };
    return { client, db: { connect: jest.fn().mockResolvedValue(client) } };
  }

  test('redeeming makes their own account, adds them to the board and uses the code up', async () => {
    const { client, db } = redeemDb({ id: 'i3', workspace_id: 'board-a', status: 'pending', expires_at: new Date(NOW + 1000) });
    const result = await store.redeemJoinCode(db, { code: 'b'.repeat(32), name: '  Sam\n ', now: NOW });
    expect(result).toEqual({ user: expect.objectContaining({ id: 12, role: 'user' }), workspaceId: 'board-a' });
    const sqls = client.query.mock.calls.map(([sql]) => sql);
    expect(sqls).toContain('COMMIT');
    const userInsert = client.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO users'));
    expect(userInsert[1][1]).toBe('Sam');
    expect(userInsert[1][0]).toMatch(/^sam\.[0-9a-f]{8}@invited\.this-computer\.local$/);
    expect(client.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO workspace_members'))[1]).toEqual(['board-a', 12]);
    expect(client.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE board_invites'))[1]).toEqual(['i3', 12]);
    expect(client.release).toHaveBeenCalled();
  });

  test('a used or expired code makes nothing', async () => {
    for (const invite of [null, { id: 'i4', workspace_id: 'b', status: 'used', expires_at: null }, { id: 'i5', workspace_id: 'b', status: 'pending', expires_at: new Date(NOW - 1) }]) {
      const { client, db } = redeemDb(invite);
      await expect(store.redeemJoinCode(db, { code: 'c'.repeat(32), name: 'Sam', now: NOW })).rejects.toMatchObject({ code: 'INVITE_USED', statusCode: 410 });
      expect(client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO users'))).toBe(false);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    }
  });

  test('a name is required and a bad code never reaches the database', async () => {
    const { db } = redeemDb(null);
    await expect(store.redeemJoinCode(db, { code: 'd'.repeat(32), name: '   ' })).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
    await expect(store.redeemJoinCode(db, { code: '../x', name: 'Sam' })).rejects.toMatchObject({ code: 'INVITE_USED' });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('a waiting invite becomes an Inbox line with an Open board button', () => {
    const report = { ...inviteReport({ id: 'i1', workspaceId: 'board-a', boardName: 'Family board', byName: 'Alex', createdAt: '2026-10-18T21:00:00Z' }), source: 'board-invites' };
    const item = errorItem(report);
    expect(item).toMatchObject({ kind: 'invite', inviteId: 'i1', boardId: 'board-a', title: 'Alex invited you to Family board', state: 'invite_for_you', group: 'needs' });
  });

  test('invited sign-in addresses are tidy and never real mailboxes', () => {
    expect(store.invitedEmail('Zoë O\'Neil', 'abcd1234')).toBe('zoe.o.neil.abcd1234@invited.this-computer.local');
    expect(store.invitedEmail('😀', 'abcd1234')).toBe('guest.abcd1234@invited.this-computer.local');
  });
});
