// server/social/remote.js
//
// Following someone on another censaiOS. Their Social window hands out an
// address and a key; this computer reads their profile and feed with them,
// straight from their outside door (the same door shared agents use, so the
// same tunnel works). Each answer is signed by their install key, and the
// first key seen is remembered, so an address that later answers as a
// different computer is refused. The last copy is kept, so their feed still
// shows while their computer is off.

import { canonicalJson } from '../agentNetwork/canonical.js';
import { installIdFor, verifySignature } from '../agentNetwork/installIdentity.js';
import { createExternalGuardedFetch } from '../agent-registry/adapters/egress.js';
import { decryptKey } from '../security/vault.js';
import { SocialError } from './keys.js';

export const FEED_KIND = 'censai.social-feed';
export const REFRESH_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// When each follow was last tried, so a computer that is off costs one
// timeout per REFRESH_MS, not one per feed load.
const lastTried = new Map();
const PATH = new RegExp(`^/api/social/v1/profiles/(${UUID})/?$`, 'i');

/** https://<host>/api/social/v1/profiles/<id> -> { origin, profileId, url } */
export function parseProfileAddress(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch {
    throw new SocialError('That is not a web address. Copy the profile address from their Social window.', 422, 'SOCIAL_ADDRESS_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new SocialError('Profile addresses start with https:// (or http:// on this computer).', 422, 'SOCIAL_ADDRESS_INVALID');
  }
  const match = PATH.exec(url.pathname);
  if (!match) {
    throw new SocialError('That address is not a censaiOS profile. It ends in /api/social/v1/profiles/<id>.', 422, 'SOCIAL_ADDRESS_INVALID');
  }
  const profileId = match[1].toLowerCase();
  return { origin: url.origin, profileId, url: `${url.origin}/api/social/v1/profiles/${profileId}` };
}

/** Check a signed feed from anywhere. -> { ok, installId } */
export function verifyFeed(signed) {
  const body = signed?.body;
  if (!body || body.kind !== FEED_KIND) return { ok: false, installId: null };
  const signer = body.signer || {};
  if (!signer.publicKey || installIdFor(signer.publicKey) !== signer.install) return { ok: false, installId: null };
  return { ok: verifySignature(canonicalJson(body), signed.signature, signer.publicKey), installId: signer.install };
}

/** Read one remote profile. Throws SocialError; `unreachable` marks a computer that is off. */
export async function fetchRemoteFeed(address, key, options = {}) {
  const errorFactory = (message, _suffix, statusCode) => new SocialError(message, statusCode, 'SOCIAL_EGRESS');
  const guarded = options.guardedFetch || createExternalGuardedFetch({ ...options, errorFactory });
  let res;
  try {
    res = await guarded(address.url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs || FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof SocialError) throw error;
    throw Object.assign(new SocialError('Their censaiOS is not answering. It may be switched off.', 502, 'SOCIAL_UNREACHABLE'), { unreachable: true });
  }
  if (res.status === 401) throw new SocialError('That key does not open this profile. Ask them for a fresh one.', 422, 'SOCIAL_KEY_REFUSED');
  if (res.status === 404) throw new SocialError('No profile lives at that address.', 422, 'SOCIAL_NO_PROFILE');
  if (!res.ok) throw Object.assign(new SocialError('Their censaiOS is not answering. It may be switched off.', 502, 'SOCIAL_UNREACHABLE'), { unreachable: true });
  const signed = await res.json().catch(() => null);
  const check = verifyFeed(signed);
  if (!signed?.body || signed.body.kind !== FEED_KIND) {
    throw new SocialError('That address answered, but not like a censaiOS profile.', 422, 'SOCIAL_NOT_A_PROFILE');
  }
  return { feed: signed.body, verified: check.ok, installId: check.installId };
}

function keyFor(follow) {
  try { return decryptKey(follow.key_encrypted, Number(follow.user_id)); } catch { return ''; }
}

/** Refresh one remote follow when its copy is older than REFRESH_MS. Never throws. */
export async function refreshRemoteFollow(db, follow, { force = false, now = Date.now(), ...options } = {}) {
  if (!follow.remote_address) return follow;
  const tried = lastTried.get(String(follow.id)) || 0;
  if (!force && now - tried < REFRESH_MS) return follow;
  lastTried.set(String(follow.id), now);
  let cache = follow.remote_cache;
  let error = null;
  let installId = follow.remote_install_id;
  try {
    const got = await fetchRemoteFeed(parseProfileAddress(follow.remote_address), keyFor(follow), options);
    if (installId && got.installId && installId !== got.installId) {
      throw new SocialError('This address now answers as a different computer, so its feed is paused.', 409, 'SOCIAL_INSTALL_CHANGED');
    }
    installId = installId || got.installId;
    cache = { ...got.feed, verified: got.verified };
  } catch (failure) {
    error = failure.message;
  }
  const { rows } = await db.query(
    `UPDATE social_follows SET remote_cache = $2::jsonb, remote_install_id = $3, fetch_error = $4,
            fetched_at = CASE WHEN $4::text IS NULL THEN NOW() ELSE fetched_at END
      WHERE id = $1 RETURNING *`,
    [follow.id, cache ? JSON.stringify(cache) : null, installId || null, error],
  );
  return rows[0] || follow;
}
