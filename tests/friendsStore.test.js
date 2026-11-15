// tests/friendsStore.test.js
//
// The owner's friends list (server/friends/store.js): adding from a friend
// code makes the friend's own account here; removing takes them off every
// board; sharing a board needs the owner to manage that board.

import { jest } from '@jest/globals';

const requireWorkspaceMember = jest.fn();
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/workspaces/members.js', () => ({ WORKSPACE_MEMBER_MANAGE_ROLES: ['owner', 'admin'] }));

const store = await import('../server/friends/store.js');

const KEY = 'ab'.repeat(32);
const OWN = 'ef'.repeat(32);

/** A stand-in database that answers the store's own questions from two lists. */
function fakeDb({ friends = [], count = friends.length } = {}) {
  const calls = [];
  const run = async (sql, params = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/^CREATE TABLE/.test(sql.trim()) || /^--/.test(sql.trim())) return { rows: [] };
    if (/SELECT COUNT/.test(sql)) return { rows: [{ n: count }] };
    if (/FROM friends WHERE owner_user_id = \$1 AND friend_key = \$2/.test(sql)) return { rows: friends.filter((f) => f.friend_key === params[1]) };
    if (/FROM friends WHERE owner_user_id = \$1 AND id::text = \$2/.test(sql)) return { rows: friends.filter((f) => f.id === params[1]) };
    if (/FROM friends WHERE owner_user_id = \$1 ORDER BY/.test(sql)) return { rows: friends };
    if (/INSERT INTO users/.test(sql)) return { rows: [{ id: 41 }] };
    if (/INSERT INTO friends/.test(sql)) return { rows: [{ id: params[0], name: params[3], friend_key: params[2], user_id: params[4], created_at: new Date('2026-11-13T12:00:00Z') }] };
    return { rows: [], rowCount: 1 };
  };
  const db = { query: run, connect: async () => ({ query: run, release: () => {} }) };
  return { db, calls, ran: (pattern) => calls.filter((call) => pattern.test(call.sql)) };
}

const row = (over = {}) => ({ id: 'f-1', name: 'Sam', friend_key: KEY, user_id: 41, created_at: '2026-11-13T12:00:00.000Z', ...over });

describe('adding a friend', () => {
  test('makes their own account here, as an ordinary person, and puts them on the list', async () => {
    const { db, ran } = fakeDb();
    const { friend, alreadyThere } = await store.addFriend(db, { ownerId: 7, name: ' Sam ', key: `nodekey:${KEY}`, ownKey: OWN });
    expect(alreadyThere).toBe(false);
    expect(friend).toMatchObject({ name: 'Sam', key: KEY, userId: 41 });
    const [account] = ran(/INSERT INTO users/);
    expect(account.sql).toContain("'user'");
    expect(account.params[0]).toMatch(/^friend\.[0-9a-f]{24}\.[0-9a-f]{6}@friends\.this-computer\.local$/);
    expect(account.params[1]).toBe('Sam');
    expect(ran(/^COMMIT/)).toHaveLength(1);
  });

  test('the same code twice is one friend, with no second account', async () => {
    const { db, ran } = fakeDb({ friends: [row()] });
    const { friend, alreadyThere } = await store.addFriend(db, { ownerId: 7, name: 'Sam again', key: KEY, ownKey: OWN });
    expect(alreadyThere).toBe(true);
    expect(friend.id).toBe('f-1');
    expect(ran(/INSERT INTO/)).toHaveLength(0);
  });

  test('your own code is refused, and so is a key that is not a key', async () => {
    const { db, ran } = fakeDb();
    await expect(store.addFriend(db, { ownerId: 7, name: 'Me', key: OWN, ownKey: OWN })).rejects.toMatchObject({ code: 'OWN_CODE' });
    await expect(store.addFriend(db, { ownerId: 7, name: 'X', key: 'nope', ownKey: OWN })).rejects.toThrow(/not complete/);
    expect(ran(/INSERT INTO/)).toHaveLength(0);
  });

  test('a full list takes no more, and nothing is half-made', async () => {
    const { db, ran } = fakeDb({ count: store.MAX_FRIENDS });
    await expect(store.addFriend(db, { ownerId: 7, name: 'Sam', key: KEY, ownKey: OWN })).rejects.toMatchObject({ code: 'LIST_FULL', statusCode: 409 });
    expect(ran(/INSERT INTO/)).toHaveLength(0);
    expect(ran(/^ROLLBACK/)).toHaveLength(1);
  });
});

describe('removing a friend', () => {
  test('takes them off the list and off every board, and leaves their own first board alone', async () => {
    const { db, ran } = fakeDb({ friends: [row()] });
    const removed = await store.removeFriend(db, { ownerId: 7, friendId: 'f-1' });
    expect(removed).toMatchObject({ id: 'f-1', userId: 41 });
    const [boards] = ran(/DELETE FROM workspace_members/);
    expect(boards.sql).toContain("role <> 'owner'");
    expect(boards.params).toEqual([41]);
    expect(ran(/DELETE FROM friends/)[0].params).toEqual(['f-1', 7]);
  });

  test('someone who is not on this owner\'s list changes nothing', async () => {
    const { db, ran } = fakeDb({ friends: [] });
    expect(await store.removeFriend(db, { ownerId: 7, friendId: 'f-1' })).toBeNull();
    expect(ran(/^DELETE/)).toHaveLength(0);
  });
});

describe('putting a friend on a board', () => {
  beforeEach(() => requireWorkspaceMember.mockReset());

  test('needs the owner to manage that board', async () => {
    requireWorkspaceMember.mockRejectedValue(Object.assign(new Error('Workspace access denied'), { statusCode: 403 }));
    const { db, ran } = fakeDb();
    await expect(store.putOnBoard(db, { ownerId: 7, friend: { id: 'f-1', userId: 41 }, workspaceId: 'someone-elses' })).rejects.toThrow('Workspace access denied');
    expect(requireWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'someone-elses', userId: 7, roles: ['owner', 'admin'] });
    expect(ran(/INSERT INTO workspace_members/)).toHaveLength(0);
  });

  test('adds them as "can edit" or "can look", and never changes an owner or admin', async () => {
    requireWorkspaceMember.mockResolvedValue({ id: 'board-a', name: 'Family board', role: 'owner' });
    const { db, ran } = fakeDb();
    expect(await store.putOnBoard(db, { ownerId: 7, friend: { id: 'f-1', userId: 41 }, workspaceId: 'board-a', role: 'viewer' })).toEqual({ id: 'board-a', name: 'Family board' });
    const [insert] = ran(/INSERT INTO workspace_members/);
    expect(insert.params).toEqual(['board-a', 41, 'viewer']);
    expect(insert.sql).toContain("workspace_members.role IN ('member', 'viewer')");
    await expect(store.putOnBoard(db, { ownerId: 7, friend: { id: 'f-1', userId: 41 }, workspaceId: 'board-a', role: 'admin' })).rejects.toThrow(/can edit/);
    await expect(store.putOnBoard(db, { ownerId: 7, friend: { id: 'f-1', userId: null }, workspaceId: 'board-a' })).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
  });
});
