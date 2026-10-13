// server/social/keys.js
//
// Profile keys: what a person hands a friend so the friend's censaiOS can
// read their profile and feed. Same shape as agent keys (the key is the
// permission, 256 bits, only its SHA-256 kept); "csk_" marks it as a
// censaiOS social key for people and secret scanners.

import crypto from 'node:crypto';

const PREFIX = 'csk_';
const KEY_PATTERN = /^csk_[A-Za-z0-9_-]{43}$/;

export class SocialError extends Error {
  constructor(message, statusCode = 400, code = 'SOCIAL_ERROR') {
    super(message);
    this.name = 'SocialError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createProfileKey() {
  return `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function isProfileKeyShape(key) {
  return KEY_PATTERN.test(String(key || ''));
}

export function hashProfileKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

export function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Make a key for this person. Returns { key, row }; the key is shown once. */
export async function issueProfileKey(db, { userId, label }) {
  const key = createProfileKey();
  const { rows } = await db.query(
    `INSERT INTO social_keys (user_id, key_hash, hint, label) VALUES ($1, $2, $3, $4)
     RETURNING id, hint, label, created_at, last_used_at, revoked_at`,
    [userId, hashProfileKey(key), key.slice(-4), cleanText(label, 80) || null],
  );
  return { key, row: rows[0] };
}

export async function listProfileKeys(db, userId) {
  const { rows } = await db.query(
    `SELECT id, hint, label, created_at, last_used_at, revoked_at FROM social_keys
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

export async function revokeProfileKey(db, { userId, keyId }) {
  const { rowCount } = await db.query(
    `UPDATE social_keys SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1 AND id::text = $2`,
    [userId, String(keyId)],
  );
  return rowCount > 0;
}

/** The person a key opens, or null. Marks the key as used. */
export async function personForKey(db, key) {
  if (!isProfileKeyShape(key)) return null;
  const { rows } = await db.query(
    `UPDATE social_keys SET last_used_at = NOW()
      WHERE key_hash = $1 AND revoked_at IS NULL
      RETURNING user_id`,
    [hashProfileKey(key)],
  );
  return rows[0] ? Number(rows[0].user_id) : null;
}
