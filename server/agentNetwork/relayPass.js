// server/agentNetwork/relayPass.js
//
// The pass an install shows a relay to collect its calls:
//   crp1.<payload>.<signature>        (both base64url)
//   payload   { iid, pk, aud, iat, exp }  install id, its public key, the
//             relay origin it is meant for, issued and expiry (seconds)
//   signature Ed25519 over the payload bytes with the install's key
// The relay needs no account system: the install id is the fingerprint of
// pk, so only the holder of the private key can collect that install's
// calls. Passes are short-lived (5 minutes) and tied to one relay.

import { installIdFor, verifySignature } from './installIdentity.js';

const PREFIX = 'crp1';
const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 3600;

export function createRelayPass(signer, { relay, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const payload = {
    iid: signer.installId,
    pk: signer.publicKey,
    aud: new URL(String(relay)).origin,
    iat,
    exp: iat + Math.min(MAX_TTL_SECONDS, Math.max(30, ttlSeconds)),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${PREFIX}.${encoded}.${signer.sign(encoded)}`;
}

/** Returns { ok, installId, reason }. */
export function verifyRelayPass(token, { relay, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'not a relay pass' };
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch {
    return { ok: false, reason: 'unreadable pass' };
  }
  if (!payload?.pk || installIdFor(payload.pk) !== payload.iid) return { ok: false, reason: 'install id does not match its key' };
  if (relay && payload.aud !== new URL(String(relay)).origin) return { ok: false, reason: 'pass is for another relay' };
  const t = Math.floor(now / 1000);
  if (!(payload.iat <= t + 60 && t < payload.exp) || payload.exp - payload.iat > MAX_TTL_SECONDS) {
    return { ok: false, reason: 'pass expired' };
  }
  if (!verifySignature(parts[1], parts[2], payload.pk)) return { ok: false, reason: 'signature does not match' };
  return { ok: true, installId: payload.iid, reason: null };
}
