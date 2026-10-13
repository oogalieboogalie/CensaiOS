// server/shareLinks/liveGuests.js
//
// Every open guest socket (presence channel and Yjs channel) registers
// here under its share link, so revoking a link or reaching its expiry
// closes them straight away instead of waiting for a reconnect to fail.

const MAX_TIMER_MS = 2_147_000_000;
const byLink = new Map();

export const GUEST_CLOSE_CODES = Object.freeze({ revoked: 4403, expired: 4410 });

/**
 * Track one guest socket. `close(code, reason)` must close it. Returns an
 * untrack function to call when the socket closes on its own.
 */
export function trackGuestSocket(linkId, close, { expiresAt = null } = {}) {
  const key = String(linkId);
  let bucket = byLink.get(key);
  if (!bucket) {
    bucket = new Set();
    byLink.set(key, bucket);
  }
  const entry = { close, timer: null };
  if (expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    entry.timer = setTimeout(() => {
      untrack();
      safeClose(entry, GUEST_CLOSE_CODES.expired, 'Share link expired');
    }, Math.max(0, Math.min(ms, MAX_TIMER_MS)));
    entry.timer.unref?.();
  }
  bucket.add(entry);
  function untrack() {
    clearTimeout(entry.timer);
    bucket.delete(entry);
    if (bucket.size === 0 && byLink.get(key) === bucket) byLink.delete(key);
  }
  return untrack;
}

function safeClose(entry, code, reason) {
  try { entry.close(code, reason); } catch { /* socket already gone */ }
}

/** Close every socket that joined through a link. Returns how many closed. */
export function disconnectShareLink(linkId, { code = GUEST_CLOSE_CODES.revoked, reason = 'Share link turned off' } = {}) {
  const bucket = byLink.get(String(linkId));
  if (!bucket) return 0;
  byLink.delete(String(linkId));
  let closed = 0;
  for (const entry of bucket) {
    clearTimeout(entry.timer);
    safeClose(entry, code, reason);
    closed += 1;
  }
  return closed;
}

export function countGuestSockets(linkId) {
  return byLink.get(String(linkId))?.size || 0;
}

export function __resetLiveGuestsForTests() {
  for (const bucket of byLink.values()) for (const entry of bucket) clearTimeout(entry.timer);
  byLink.clear();
}
