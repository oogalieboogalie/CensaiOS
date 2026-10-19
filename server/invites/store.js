// Board invites (docker/071-board-invites.sql): ask someone to join one board.
//
//  inviteToBoard    an email with an account here: they become a member and
//                   get an Inbox line and a toast. No account (or no email):
//                   a one-time join link, when this copy allows them.
//  listMyInvites    the invites waiting for one person
//  markInvite       "opened" (they went to the board) or "dismissed"
//  previewJoinCode  what a join link is for, shown before they join
//  redeemJoinCode   makes their account, adds them to the board, once

import crypto from 'node:crypto';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { inviteRegisteredWorkspaceMember, WORKSPACE_MEMBER_MANAGE_ROLES } from '../workspaces/members.js';

export const JOIN_LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export const INVITED_EMAIL_DOMAIN = 'invited.this-computer.local';

export class InviteError extends Error {
  constructor(message, { statusCode = 400, code = 'INVITE_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
export const isJoinCode = (code) => typeof code === 'string' && CODE_PATTERN.test(code);

const boardName = (name) => String(name || '').trim() || 'a board';
const personName = (row) => String(row?.by_name || row?.by_email?.split('@')[0] || 'Someone');

/** A person's name as they typed it: one line, no control characters. */
export function cleanName(value) {
  // eslint-disable-next-line no-control-regex
  const name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) throw new InviteError('Type your name first.', { code: 'NAME_REQUIRED' });
  return name.slice(0, 60);
}

/** A sign-in address for an account made from a join link (never mailed). */
export function invitedEmail(name, random = crypto.randomBytes(4).toString('hex')) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30) || 'guest';
  return `${slug}.${random}@${INVITED_EMAIL_DOMAIN}`;
}

async function notifyAccount(db, { workspaceId, by, to }) {
  if (!to || Number(to) === Number(by)) return false;
  const result = await db.query(
    `INSERT INTO board_invites (id, workspace_id, invited_by, invited_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, invited_user_id)
       WHERE status = 'pending' AND invited_user_id IS NOT NULL DO NOTHING`,
    [crypto.randomUUID(), workspaceId, by, to],
  );
  return result.rowCount > 0;
}

export async function createJoinLink(db, { workspaceId, userId, now = Date.now() }) {
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId, roles: WORKSPACE_MEMBER_MANAGE_ROLES });
  const code = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(now + JOIN_LINK_DAYS * DAY_MS);
  await db.query(
    `INSERT INTO board_invites (id, workspace_id, invited_by, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), workspace.id, userId, hashCode(code), expiresAt],
  );
  return { workspace: { id: workspace.id, name: workspace.name }, code, expiresAt: expiresAt.toISOString() };
}

export async function inviteToBoard(db, { workspaceId, userId, email, allowJoinLinks = false, now = Date.now() }) {
  const address = String(email || '').trim();
  if (address) {
    try {
      const result = await inviteRegisteredWorkspaceMember(db, { workspaceId, userId, email: address });
      const notified = await notifyAccount(db, { workspaceId: result.workspace.id, by: userId, to: result.member.id });
      return { kind: 'account', ...result, notified };
    } catch (error) {
      if (error.code !== 'REGISTERED_ACCOUNT_REQUIRED' || !allowJoinLinks) throw error;
    }
  }
  if (!allowJoinLinks) {
    throw new InviteError('Type the email of someone who already has an account here.', { statusCode: 409, code: 'JOIN_LINKS_OFF' });
  }
  return { kind: 'link', ...(await createJoinLink(db, { workspaceId, userId, now })) };
}

export async function listMyInvites(db, userId) {
  const { rows } = await db.query(
    `SELECT bi.id, bi.workspace_id, bi.created_at, w.name AS board_name, u.name AS by_name, u.email AS by_email
       FROM board_invites bi
       JOIN workspaces w ON w.id = bi.workspace_id
       JOIN workspace_members wm ON wm.workspace_id = bi.workspace_id AND wm.user_id = bi.invited_user_id
       LEFT JOIN users u ON u.id = bi.invited_by
      WHERE bi.invited_user_id = $1 AND bi.status = 'pending'
      ORDER BY bi.created_at DESC
      LIMIT 20`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    boardName: boardName(row.board_name),
    byName: personName(row),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

export async function markInvite(db, { id, userId, status }) {
  if (!['opened', 'dismissed'].includes(status)) throw new InviteError('Unknown invite step.');
  const { rows } = await db.query(
    `UPDATE board_invites SET status = $3, updated_at = NOW()
      WHERE id = $1 AND invited_user_id = $2 AND status = 'pending'
      RETURNING workspace_id`,
    [String(id || ''), userId, status],
  );
  return rows[0] ? { workspaceId: rows[0].workspace_id } : null;
}

function usable(row, now) {
  return row && row.status === 'pending' && (!row.expires_at || new Date(row.expires_at).getTime() > now);
}

export async function previewJoinCode(db, code, { now = Date.now() } = {}) {
  if (!isJoinCode(code)) return null;
  const { rows } = await db.query(
    `SELECT bi.status, bi.expires_at, w.name AS board_name, u.name AS by_name, u.email AS by_email
       FROM board_invites bi
       JOIN workspaces w ON w.id = bi.workspace_id
       LEFT JOIN users u ON u.id = bi.invited_by
      WHERE bi.code_hash = $1`,
    [hashCode(code)],
  );
  if (!usable(rows[0], now)) return null;
  return { boardName: boardName(rows[0].board_name), byName: personName(rows[0]) };
}

const USED_UP = () => new InviteError('This invite was used already or has run out. Ask for a new one.', { statusCode: 410, code: 'INVITE_USED' });

export async function redeemJoinCode(db, { code, name, now = Date.now() }) {
  if (!isJoinCode(code)) throw USED_UP();
  const cleanedName = cleanName(name);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, workspace_id, status, expires_at FROM board_invites WHERE code_hash = $1 FOR UPDATE',
      [hashCode(code)],
    );
    const invite = rows[0];
    if (!usable(invite, now)) throw USED_UP();
    const created = await client.query(
      "INSERT INTO users (email, name, role) VALUES ($1, $2, 'user') RETURNING id, email, name, role",
      [invitedEmail(cleanedName), cleanedName],
    );
    const user = created.rows[0];
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [invite.workspace_id, user.id],
    );
    await client.query(
      "UPDATE board_invites SET status = 'used', used_by_user_id = $2, updated_at = NOW() WHERE id = $1",
      [invite.id, user.id],
    );
    await client.query('COMMIT');
    return { user, workspaceId: invite.workspace_id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
