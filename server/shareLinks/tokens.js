// server/shareLinks/tokens.js
//
// Capability-token helpers for guest links. The token in a share URL is the
// permission itself, so it carries 256 bits of randomness and only its
// SHA-256 is ever stored. Passcodes are optional, short and human-typed,
// so they get a salted scrypt hash instead.

import crypto from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SCRYPT_KEYLEN = 32;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_NAME_LENGTH = 40;
const MAX_PASSCODE_LENGTH = 128;

export function createShareToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isShareTokenShape(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function hashPasscode(passcode) {
  const value = String(passcode ?? '');
  if (!value) return null;
  if (value.length > MAX_PASSCODE_LENGTH) throw new Error('Passcode is too long');
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(value, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPasscode(passcode, stored) {
  if (!stored) return true;
  const [scheme, saltText, hashText] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const value = String(passcode ?? '');
  if (!value || value.length > MAX_PASSCODE_LENGTH) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = crypto.scryptSync(value, Buffer.from(saltText, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function createGuestId() {
  return `guest-${crypto.randomBytes(9).toString('base64url')}`;
}

export function normalizeGuestName(value) {
  // Strip control characters and collapse whitespace; names show on cursors.
  // eslint-disable-next-line no-control-regex
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return name.slice(0, MAX_NAME_LENGTH);
}

export function normalizeGuestColor(value) {
  const color = String(value ?? '').trim();
  return COLOR_PATTERN.test(color) ? color.toLowerCase() : null;
}

export const SHARE_TOKEN_LIMITS = Object.freeze({
  tokenBytes: TOKEN_BYTES,
  maxNameLength: MAX_NAME_LENGTH,
  maxPasscodeLength: MAX_PASSCODE_LENGTH,
});
