// The owner's friends list (docker/097-friends.sql).
//
//  addFriend      from a friend code. Makes the friend's own account on this
//                 copy, so on a shared board they are themselves.
//  listFriends    the owner's friends
//  removeFriend   takes the friend off the list and off every board
//  putOnBoard     makes the friend a member of one board the owner manages

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { WORKSPACE_MEMBER_MANAGE_ROLES } from '../workspaces/members.js';
import { cleanLabel, plainKey } from './codes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/097-friends.sql');
export const MAX_FRIENDS = 100;
export const FRIEND_EMAIL_DOMAIN = 'friends.this-computer.local';
export const BOARD_ROLES = Object.freeze(['member', 'viewer']);

const ready = new WeakSet();

/** Creates the table the first time Friends is used on an install that has none. */
export async function ensureFriendsSchema(db) {
  if (ready.has(db)) return;
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  ready.add(db);
}

export class FriendError extends Error {
  constructor(message, { statusCode = 400, code = 'FRIEND_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** A sign-in address for a friend's account. It is never mailed and nobody can type it to sign in. */
export function friendEmail(key) {
  return `friend.${key.slice(0, 24)}.${crypto.randomBytes(3).toString('hex')}@${FRIEND_EMAIL_DOMAIN}`;
}

function toFriend(row) {
  return {
    id: row.id,
    name: row.name,
    key: row.friend_key,
    userId: row.user_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function listFriends(db, ownerId) {
  await ensureFriendsSchema(db);
  const { rows } = await db.query(
    'SELECT id, name, friend_key, user_id, created_at FROM friends WHERE owner_user_id = $1 ORDER BY LOWER(name), created_at',
    [ownerId],
  );
  return rows.map(toFriend);
}

export async function findFriend(db, ownerId, friendId) {
  await ensureFriendsSchema(db);
  const { rows } = await db.query(
    'SELECT id, name, friend_key, user_id, created_at FROM friends WHERE owner_user_id = $1 AND id::text = $2',
    [ownerId, String(friendId || '')],
  );
  return rows[0] ? toFriend(rows[0]) : null;
}

/**
 * @param {{ ownerId: number, name: string, key: string, ownKey?: string }} input
 * @returns {Promise<{ friend: object, alreadyThere: boolean }>}
 */
export async function addFriend(db, { ownerId, name, key, ownKey = '' }) {
  await ensureFriendsSchema(db);
  const friendKey = plainKey(key);
  const friendName = cleanLabel(name) || 'Someone';
  if (!friendKey) throw new FriendError('That friend code is not complete. Copy the whole code and paste it again.');
  if (friendKey === plainKey(ownKey)) throw new FriendError('That is your own friend code. Paste the one your friend sent you.', { code: 'OWN_CODE' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, name, friend_key, user_id, created_at FROM friends WHERE owner_user_id = $1 AND friend_key = $2 FOR UPDATE',
      [ownerId, friendKey],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { friend: toFriend(existing.rows[0]), alreadyThere: true };
    }
    const count = await client.query('SELECT COUNT(*)::int AS n FROM friends WHERE owner_user_id = $1', [ownerId]);
    if (count.rows[0].n >= MAX_FRIENDS) {
      throw new FriendError(`Your friends list is full (${MAX_FRIENDS}). Remove someone first.`, { statusCode: 409, code: 'LIST_FULL' });
    }
    const account = await client.query(
      "INSERT INTO users (email, name, role) VALUES ($1, $2, 'user') RETURNING id",
      [friendEmail(friendKey), friendName],
    );
    const inserted = await client.query(
      `INSERT INTO friends (id, owner_user_id, friend_key, name, user_id) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, friend_key, user_id, created_at`,
      [crypto.randomUUID(), ownerId, friendKey, friendName, account.rows[0].id],
    );
    await client.query('COMMIT');
    return { friend: toFriend(inserted.rows[0]), alreadyThere: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Off the list and off every board. Their account stays, so what they wrote keeps its name. */
export async function removeFriend(db, { ownerId, friendId }) {
  const friend = await findFriend(db, ownerId, friendId);
  if (!friend) return null;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (friend.userId != null) {
      await client.query("DELETE FROM workspace_members WHERE user_id = $1 AND role <> 'owner'", [friend.userId]);
    }
    await client.query('DELETE FROM friends WHERE id = $1 AND owner_user_id = $2', [friend.id, ownerId]);
    await client.query('COMMIT');
    return friend;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Makes the friend a member of one board. The owner must manage that board.
 * @param {{ ownerId: number, friend: object, workspaceId: string, role?: 'member'|'viewer' }} input
 */
export async function putOnBoard(db, { ownerId, friend, workspaceId, role = 'member' }) {
  if (!BOARD_ROLES.includes(role)) throw new FriendError('Choose "can edit" or "can look".');
  if (friend?.userId == null) throw new FriendError('Add this friend again: their account here is gone.', { statusCode: 409, code: 'NO_ACCOUNT' });
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId: ownerId, roles: WORKSPACE_MEMBER_MANAGE_ROLES });
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
       WHERE workspace_members.role IN ('member', 'viewer')`,
    [workspace.id, friend.userId, role],
  );
  return { id: workspace.id, name: workspace.name };
}
