// server/agentEndpoints/rateLimit.js
//
// In-memory limits for outside calls. Each key gets a fixed number of
// questions per minute and a small number running at once, so a looping
// client cannot burn through the owner's model budget. Wrong keys are
// counted per address so guessing is slow and quiet in the logs.

export const LIMITS = Object.freeze({
  callsPerMinute: 20,
  concurrentPerKey: 2,
  badKeysPerMinute: 30,
});

const WINDOW_MS = 60 * 1000;

export function createLimiter({ limits = LIMITS, now = () => Date.now() } = {}) {
  const calls = new Map();
  const running = new Map();
  const badKeys = new Map();

  function bump(map, key, max) {
    const t = now();
    let rec = map.get(key);
    if (!rec || t - rec.start >= WINDOW_MS) {
      rec = { start: t, count: 0 };
      map.set(key, rec);
    }
    if (rec.count >= max) return { ok: false, retryAfter: Math.max(1, Math.ceil((rec.start + WINDOW_MS - t) / 1000)) };
    rec.count += 1;
    return { ok: true };
  }

  return {
    /** Claim a slot for one call on this key. Call release() when it ends. */
    acquire(keyId) {
      const busy = running.get(keyId) || 0;
      if (busy >= limits.concurrentPerKey) return { ok: false, retryAfter: 5, reason: 'busy' };
      const rate = bump(calls, keyId, limits.callsPerMinute);
      if (!rate.ok) return { ...rate, reason: 'rate' };
      running.set(keyId, busy + 1);
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          const left = (running.get(keyId) || 1) - 1;
          if (left > 0) running.set(keyId, left); else running.delete(keyId);
        },
      };
    },
    /** Count a wrong or revoked key from this address. */
    badKey(address) {
      return bump(badKeys, String(address || 'unknown'), limits.badKeysPerMinute);
    },
    reset() { calls.clear(); running.clear(); badKeys.clear(); },
  };
}

export const endpointLimiter = createLimiter();
