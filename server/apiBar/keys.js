// server/apiBar/keys.js
//
// Bar keys: the one key that opens the bar. A key is a capability token
// ("cbk_" + 256 random bits); only its SHA-256 is kept. Each key names the
// branches it may open, and a "look only" key cannot run anything that
// spends money or changes something. Revoking a key closes every branch at
// once, which is the point of having one door.

import crypto from 'node:crypto';
import { BRANCH_NAMES } from './catalog.js';

const PREFIX = 'cbk_';
const TOKEN_PATTERN = /^cbk_[A-Za-z0-9_-]{43}$/;
const KEY_COLUMNS = 'id, user_id, label, branches, look_only, token_hint, created_at, last_used_at, revoked_at';

export class BarKeyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function createBarToken() {
  return `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function isBarTokenShape(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function hashBarToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** "Authorization: Bearer cbk_..." or an x-api-bar-key header; null when absent. */
export function barTokenFromRequest(req) {
  const auth = String(req.get?.('authorization') || '').trim();
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (match && match[1].startsWith(PREFIX)) return match[1];
  const header = String(req.get?.('x-api-bar-key') || '').trim();
  return header || null;
}

export function cleanBranches(value) {
  const list = Array.isArray(value) ? value : [];
  const picked = [...new Set(list.map(String))].filter((b) => BRANCH_NAMES.includes(b));
  if (!picked.length) throw new BarKeyError('Pick at least one branch this key may open.');
  return picked;
}

export function cleanLabel(value) {
  const label = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!label) throw new BarKeyError('Give the key a name, like "My script" or "Claude Code".');
  return label;
}

export function keyView(row) {
  return {
    id: row.id,
    label: row.label,
    branches: row.branches || [],
    lookOnly: Boolean(row.look_only),
    hint: row.token_hint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function listKeys(db, { userId }) {
  const { rows } = await db.query(
    `SELECT ${KEY_COLUMNS} FROM api_bar_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  return rows;
}

/** Returns { token, row }. The plain key exists only in this return value. */
export async function createKey(db, { userId, label, branches, lookOnly = true }) {
  const token = createBarToken();
  const { rows } = await db.query(
    `INSERT INTO api_bar_keys (user_id, label, branches, look_only, token_hash, token_hint)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${KEY_COLUMNS}`,
    [userId, cleanLabel(label), cleanBranches(branches), lookOnly !== false, hashBarToken(token), token.slice(-4)],
  );
  return { token, row: rows[0] };
}

export async function revokeKey(db, { userId, keyId }) {
  const { rows } = await db.query(
    `UPDATE api_bar_keys SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1 AND user_id = $2 RETURNING ${KEY_COLUMNS}`,
    [keyId, userId],
  );
  return rows[0] || null;
}

/** The live key and its owner's sign-in details, or null. */
export async function findKeyByToken(db, token) {
  const { rows } = await db.query(
    `SELECT k.id, k.user_id, k.label, k.branches, k.look_only, k.revoked_at,
            u.email AS user_email, u.role AS user_role, u.name AS user_name
       FROM api_bar_keys k JOIN users u ON u.id = k.user_id
      WHERE k.token_hash = $1`,
    [hashBarToken(token)],
  );
  return rows[0] || null;
}

export async function touchKey(db, keyId) {
  await db.query('UPDATE api_bar_keys SET last_used_at = NOW() WHERE id = $1', [keyId]);
}

export async function logCall(db, call) {
  await db.query(
    `INSERT INTO api_bar_calls (user_id, key_id, branch, action, method, status, duration_ms, note_in_chars, note_out_chars, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      call.userId, call.keyId || null, String(call.branch).slice(0, 40), String(call.action).slice(0, 40),
      String(call.method).slice(0, 10), Number(call.status) || 0, Math.max(0, Math.round(Number(call.durationMs) || 0)),
      Number(call.noteIn) || 0, Number(call.noteOut) || 0, call.error ? String(call.error).slice(0, 300) : null,
    ],
  );
}

export async function listCalls(db, { userId, limit = 50 }) {
  const { rows } = await db.query(
    `SELECT c.id, c.branch, c.action, c.method, c.status, c.duration_ms, c.note_in_chars, c.note_out_chars,
            c.error, c.created_at, k.label AS key_label
       FROM api_bar_calls c LEFT JOIN api_bar_keys k ON k.id = c.key_id
      WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT $2`,
    [userId, Math.min(200, Math.max(1, Number(limit) || 50))],
  );
  return rows;
}
