/**
 * "Add a computer" codes for Open anywhere. A signed-in person on their main
 * computer makes a code; the other computer opens the link (or scans the QR
 * code) once and is signed in as that same person.
 *
 * Codes are random, single use, last ten minutes, and live only in this
 * server's memory, so a restart cancels any that were not used. Only a hash
 * of each code is kept.
 */
import crypto from 'crypto';

export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES_PER_USER = 5;
const codes = new Map();

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function sweep(now) {
  for (const [key, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(key);
  }
}

export function createPairCode(userId, { now = Date.now() } = {}) {
  if (!userId) throw new Error('A signed-in person is required.');
  sweep(now);
  const mine = [...codes.entries()].filter(([, entry]) => entry.userId === userId);
  // Keep the newest few; making a new code retires the oldest.
  mine.sort((a, b) => a[1].createdAt - b[1].createdAt)
    .slice(0, Math.max(0, mine.length - (MAX_CODES_PER_USER - 1)))
    .forEach(([key]) => codes.delete(key));
  const code = crypto.randomBytes(18).toString('base64url');
  const expiresAt = now + PAIR_CODE_TTL_MS;
  codes.set(hashCode(code), { userId, createdAt: now, expiresAt });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

/** Returns the person the code belongs to, once; null when unknown or expired. */
export function redeemPairCode(code, { now = Date.now() } = {}) {
  if (typeof code !== 'string' || code.length < 16 || code.length > 64) return null;
  sweep(now);
  const key = hashCode(code);
  const entry = codes.get(key);
  if (!entry) return null;
  codes.delete(key);
  return entry.expiresAt > now ? { userId: entry.userId } : null;
}

export function clearPairCodes() {
  codes.clear();
}
