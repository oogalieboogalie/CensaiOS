// server/middleware/rateLimiter.js
//
// Lightweight in-memory rate limiter for authentication endpoints.
//
// Default policy:
//   - MAX_REQUESTS per WINDOW_MS, keyed by client IP.
//   - On overflow: 429 Too Many Requests with Retry-After header and JSON body.
//
// Bypass rules (BOTH must NOT increment or check the counter):
//   - process.env.RATE_LIMIT_DISABLED === 'true'
//   - NODE_ENV is not production and runtime mode is local_desktop
// There is deliberately no request-controlled bypass.
//
// Public surface:
//   default            Express middleware: (req, res, next) => void
//   resetRateLimiter() Clears the in-memory store (tests / hot reloads)
//   getRateLimiterSnapshot() Returns the current store (test diagnostics only)
//
// Memory model:
//   Fixed-window counter per IP. Expired windows are reaped lazily on access.
//   A periodic sweep runs every SWEEP_MS and uses an unref'd timer so it never
//   blocks process shutdown (notably Jest). To stop it entirely, call
//   resetRateLimiter() then disposeRateLimiter().

import { getRuntimeMode, RUNTIME_MODES } from './runtimeMode.js';

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 5;
const SWEEP_MS = 5 * 60 * 1000;

const store = new Map();

let sweepTimer = null;

function readEnvBypass() {
  return process.env.NODE_ENV !== 'production'
    && getRuntimeMode() === RUNTIME_MODES.LOCAL_DESKTOP
    && process.env.RATE_LIMIT_DISABLED === 'true';
}



function getClientKey(req) {
  // Express normalizes the address according to the explicitly configured
  // trust-proxy policy. Never interpret forwarding headers here.
  if (req?.ip) return req.ip;
  const sock = req?.socket?.remoteAddress;
  if (sock) return sock;
  return 'unknown';
}

function secondsUntilReset(record, now = Date.now()) {
  const elapsed = now - record.windowStartMs;
  const remainingMs = WINDOW_MS - elapsed;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function startSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store) {
      if (now - record.windowStartMs >= WINDOW_MS) {
        store.delete(key);
      }
    }
  }, SWEEP_MS);
  // Don't keep the event loop alive just for sweeping.
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

function rateLimiter(req, res, next) {
  // Lazy sweep — start once on first request.
  if (!sweepTimer) startSweeper();

  try {
    if (readEnvBypass()) {
      return next();
    }

    const key = getClientKey(req);
    const now = Date.now();
    const record = store.get(key);

    if (!record || now - record.windowStartMs >= WINDOW_MS) {
      store.set(key, { count: 1, windowStartMs: now });
      return next();
    }

    if (record.count >= MAX_REQUESTS) {
      const retryAfter = secondsUntilReset(record, now);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Too many login attempts. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    record.count += 1;
    return next();
  } catch (err) {
    // Never let the limiter crash the auth flow — fail open with a logged warning.
    // The auth handlers themselves will still surface any underlying errors.
    console.warn('[rateLimiter] unexpected error, allowing request:', err?.message);
    return next();
  }
}

function resetRateLimiter() {
  store.clear();
}

function disposeRateLimiter() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  store.clear();
}

function getRateLimiterSnapshot() {
  const out = {};
  for (const [k, v] of store) {
    out[k] = { count: v.count, windowStartMs: v.windowStartMs };
  }
  return out;
}

// Convenience property for tests / dev introspection.
rateLimiter.reset = resetRateLimiter;
rateLimiter.dispose = disposeRateLimiter;
rateLimiter.snapshot = getRateLimiterSnapshot;
Object.defineProperty(rateLimiter, 'MAX_REQUESTS', { value: MAX_REQUESTS });
Object.defineProperty(rateLimiter, 'WINDOW_MS', { value: WINDOW_MS });

export { resetRateLimiter, disposeRateLimiter, getRateLimiterSnapshot, MAX_REQUESTS, WINDOW_MS };
export default rateLimiter;
