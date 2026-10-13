// server/agentEndpoints/tokens.js
//
// Agent endpoint keys are capability tokens: the key is the permission, so it
// carries 256 bits of randomness and only its SHA-256 is stored. The "cak_"
// prefix lets people (and secret scanners) recognise a censaiOS agent key.

import crypto from 'node:crypto';

const PREFIX = 'cak_';
const TOKEN_PATTERN = /^cak_[A-Za-z0-9_-]{43}$/;

export function createEndpointToken() {
  return `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function isEndpointTokenShape(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function hashEndpointToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** The last four characters, shown in the key list so people can tell keys apart. */
export function tokenHint(token) {
  return String(token).slice(-4);
}

/** "Authorization: Bearer cak_..." (or a bare x-censai-agent-key header). */
export function tokenFromRequest(req) {
  const auth = String(req.get?.('authorization') || '');
  const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  if (match) return match[1];
  return String(req.get?.('x-censai-agent-key') || '').trim() || null;
}
