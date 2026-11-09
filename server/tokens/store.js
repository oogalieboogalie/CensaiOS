// One-time invite tokens (docker/093-invite-tokens.sql).
//
//  createToken   a 'tk_' code for a friend, a board or a workshop seat. The
//                plain code is returned once; only its hash is stored.
//  redeemToken   the first signed-in person to claim it gets in; the token
//                burns in the same transaction, so it works exactly once.
//  previewToken  what a code is for. Never burns: chat apps open links to
//                draw previews, so only the redeem POST may burn a token.
//  listMine      the tokens one person made, newest first.
//
// The older single-use board join links (server/invites/) are separate and
// keep working as they are.

import crypto from 'node:crypto';
import { hashCode } from '../invites/store.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { WORKSPACE_MEMBER_MANAGE_ROLES } from '../workspaces/members.js';

export const TOKEN_SCOPES = Object.freeze(['friend', 'board', 'workshop_seat']);
export const DEFAULT_HOURS = 72;
export const MAX_HOURS = 720;
const HOUR_MS = 60 * 60 * 1000;
const TOKEN_PATTERN = /^tk_[A-Za-z0-9_-]{32}$/;

export class TokenError extends Error {
  constructor(message, { statusCode = 400, code = 'TOKEN_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const hashToken = hashCode;
export const isToken = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);
export const newToken = () => `tk_${crypto.randomBytes(24).toString('base64url')}`;

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const displayName = (name) => String(name || '').trim() || 'Someone';

function hoursFrom(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_HOURS;
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) {
    throw new TokenError(`A token lasts 1 to ${MAX_HOURS} hours.`, { code: 'BAD_EXPIRY' });
  }
  return hours;
}

function targetFor(scope, targetId) {
  if (scope === 'friend') return null;
  const id = String(targetId ?? '').trim();
  if (!id || id.length > 200) {
    throw new TokenError(scope === 'board' ? 'Pick a board first.' : 'Pick a lesson first.', { code: 'TARGET_REQUIRED' });
  }
  return id;
}

/**
 * Makes one token. A board token needs the creator to be owner or admin of
 * that board; the caller checks that only the computer's owner makes
 * workshop seats.
 */
export async function createToken(db, { creatorId, scope, targetId, expiresInHours, now = Date.now() }) {
  if (!TOKEN_SCOPES.includes(scope)) throw new TokenError('Unknown kind of token.', { code: 'BAD_SCOPE' });
  const hours = hoursFrom(expiresInHours);
  let target = targetFor(scope, targetId);
  if (scope === 'board') {
    const board = await requireWorkspaceMember(db, { workspaceId: target, userId: creatorId, roles: WORKSPACE_MEMBER_MANAGE_ROLES });
    target = board.id;
  }
  const token = newToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(now + hours * HOUR_MS);
  await db.query(
    `INSERT INTO invite_tokens (id, token_hash, creator_id, scope, target_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, hashToken(token), creatorId, scope, target, expiresAt],
  );
  return { id, token, scope, targetId: target, expiresAt: expiresAt.toISOString() };
}

async function applyScope(client, row, userId) {
  if (row.scope === 'friend') {
    const [a, b] = [Number(row.creator_id), Number(userId)].sort((x, y) => x - y);
    await client.query(
      `INSERT INTO friendships (user_a, user_b, status, created_via_token_id)
       VALUES ($1, $2, 'accepted', $3)
       ON CONFLICT (user_a, user_b) DO UPDATE SET status = 'accepted'
         WHERE friendships.status <> 'blocked'`,
      [a, b, row.id],
    );
  } else if (row.scope === 'board') {
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [row.target_id, userId],
    );
  }
  // workshop_seat: the burned token is the seat.
}

async function whyNot(client, hash, userId) {
  const { rows } = await client.query(
    `SELECT id, status, creator_id, expires_at <= NOW() AS past_due
       FROM invite_tokens WHERE token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return 'not_found';
  if (row.status === 'burned') return 'claimed';
  if (row.status === 'expired' || row.past_due) {
    if (row.status === 'active') {
      await client.query("UPDATE invite_tokens SET status = 'expired' WHERE id = $1 AND status = 'active'", [row.id]);
    }
    return 'expired';
  }
  if (Number(row.creator_id) === Number(userId)) return 'own';
  return 'not_found';
}

/**
 * Claims a token for one signed-in person. Returns { scope, targetId } or
 * { error: 'claimed' | 'expired' | 'own' | 'not_found' }. If applying the
 * token fails, everything rolls back and the token stays active.
 */
export async function redeemToken(db, { token, userId }) {
  if (!isToken(token)) return { error: 'not_found' };
  const hash = hashToken(token);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE invite_tokens SET status = 'burned', redeemed_at = NOW(), redeemed_by = $2
        WHERE token_hash = $1 AND status = 'active' AND expires_at > NOW() AND creator_id <> $2
        RETURNING *`,
      [hash, userId],
    );
    const row = rows[0];
    if (!row) {
      const error = await whyNot(client, hash, userId);
      await client.query('COMMIT');
      return { error };
    }
    await applyScope(client, row, userId);
    await client.query('COMMIT');
    return { scope: row.scope, targetId: row.target_id ?? null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const PUBLIC_STATUS = { active: 'active', burned: 'claimed', expired: 'expired' };

/** { scope, status: 'active'|'claimed'|'expired', creatorName } or null. Never burns. */
export async function previewToken(db, token) {
  if (!isToken(token)) return null;
  const { rows } = await db.query(
    `SELECT t.scope, t.status, t.expires_at <= NOW() AS past_due, u.name AS creator_name
       FROM invite_tokens t
       LEFT JOIN users u ON u.id = t.creator_id
      WHERE t.token_hash = $1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  const status = row.status === 'active' && row.past_due ? 'expired' : PUBLIC_STATUS[row.status];
  return { scope: row.scope, status, creatorName: displayName(row.creator_name) };
}

/** The tokens one person made (never their hashes), newest first. */
export async function listMine(db, creatorId) {
  await db.query(
    `UPDATE invite_tokens SET status = 'expired'
      WHERE creator_id = $1 AND status = 'active' AND expires_at <= NOW()`,
    [creatorId],
  );
  const { rows } = await db.query(
    `SELECT t.id, t.scope, t.target_id, t.status, t.expires_at, t.redeemed_at, t.created_at, u.name AS redeemed_by_name
       FROM invite_tokens t
       LEFT JOIN users u ON u.id = t.redeemed_by
      WHERE t.creator_id = $1
      ORDER BY t.created_at DESC
      LIMIT 200`,
    [creatorId],
  );
  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    targetId: row.target_id ?? null,
    status: row.status,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    redeemedAt: iso(row.redeemed_at),
    redeemedByName: row.redeemed_at ? displayName(row.redeemed_by_name) : null,
  }));
}
