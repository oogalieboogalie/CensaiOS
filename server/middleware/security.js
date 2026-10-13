// ── Family Security Constitution ─────────────────────────────────────────────
// 1. Production NEVER has a bypass. The production check comes FIRST, always.
// 2. There is deliberately NO request-controlled bypass. Headers lie.
// 3. Auth limiters FAIL CLOSED. If the rule can't be evaluated, deny.
// 4. The Host header must match an explicit allowlist. Never echo it back.
// 5. Break any rule above and a test below fails. Run npm test before merging.
// ─────────────────────────────────────────────────────────────────────────────

import { getRuntimeMode, RUNTIME_MODES } from './runtimeMode.js';

const SWEEP_MS = 5 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isBypassed() {
  if (process.env.NODE_ENV === 'production') return false; // Rule 1: decided first
  if (process.env.NODE_ENV === 'test') return true;
  return process.env.RATE_LIMIT_DISABLED === 'true'
    && getRuntimeMode() === RUNTIME_MODES.LOCAL_DESKTOP;   // strictest combo required
}

/* ───────────────────────────── rate limiting ───────────────────────────── */

export function createRateLimiter({
  label = 'limiter',
  windowMs = 60 * 1000,
  max = 100,
  failClosed = false,                                   // true for auth endpoints (Rule 3)
  keyFor = (req) => req.ip ?? req.socket?.remoteAddress ?? null,
  now = () => Date.now(),                               // injectable clock for tests
} = {}) {
  const store = new Map();

  const sweeper = setInterval(() => {
    const t = now();
    for (const [key, rec] of store) {
      if (t - rec.windowStartMs >= windowMs) store.delete(key);
    }
  }, SWEEP_MS);
  sweeper.unref?.();

  return function rateLimiter(req, res, next) {
    try {
      if (isBypassed()) return next();

      let key = null;
      try { key = keyFor(req); } catch (err) {
        console.warn(`[security:${label}] key generation failed:`, err?.message);
      }

      if (key === null || key === undefined || key === '') {
        if (failClosed) {
          return res.status(503).json({ error: 'Unable to evaluate request. Try again shortly.' });
        }
        return next();
      }

      const t = now();
      const rec = store.get(key);

      if (!rec || t - rec.windowStartMs >= windowMs) {
        store.set(key, { count: 1, windowStartMs: t });
        return next();
      }

      if (rec.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((windowMs - (t - rec.windowStartMs)) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: `Too many requests. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        });
      }

      rec.count += 1;
      return next();
    } catch (err) {
      console.error(`[security:${label}] unexpected failure:`, err);
      if (failClosed) return res.status(503).json({ error: 'Service unavailable. Try again shortly.' });
      return next();
    }
  };
}

/** Auth-specific: keyed by IP + username so one NAT IP can't lock out a building,
 *  and one attacker can't lock out a victim by burning the shared IP budget. */
export function createAuthRateLimiter(options = {}) {
  return createRateLimiter({
    label: 'auth',
    max: 5,
    failClosed: true,
    keyFor: (req) => {
      const ip = req.ip ?? req.socket?.remoteAddress;
      const user = normalize(req.body?.username).replace(/\s+/g, '');
      return user ? `${ip}|${user}` : ip ?? null;
    },
    ...options,
  });
}

/* ────────────────────────────── CSRF guarding ───────────────────────────── */

export function createCsrfOriginGuard({ appOrigin, apiOrigin } = {}) {
  const front = appOrigin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const back  = apiOrigin  ?? process.env.API_ORIGIN;   // set in prod if API lives on its own host

  const allowedOrigins = new Set();
  const allowedHosts   = new Set();
  for (const raw of [front, back]) {
    if (!raw) continue;
    let url;
    try { url = new URL(String(raw)); } catch {
      throw new Error(`[security] Origins must be absolute URLs (got "${raw}"). Fix APP_ORIGIN/API_ORIGIN.`); // fail fast at boot, not mid-request
    }
    allowedOrigins.add(url.origin.toLowerCase());
    allowedHosts.add(url.host.toLowerCase());
  }

  const devLocalAllowed = process.env.NODE_ENV !== 'production';
  const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

  return function csrfOriginGuard(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();

    // Rule 4: Host must be someone we serve. Kills DNS rebinding at the door.
    const host = normalize(req.get('host')).replace(/\/$/, '');
    if (!allowedHosts.has(host) && !(devLocalAllowed && LOCAL_HOST.test(host))) {
      return res.status(403).json({ error: 'Request host is not allowed.' });
    }

    const site = normalize(req.get('sec-fetch-site'));
    if (site === 'same-origin' || site === 'none') return next();
    if (site === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request rejected.' });
    }
    // No Sec-Fetch-Site header (older clients) → fall through to Origin checks.

    const originHeader = req.get('origin');
    if (!originHeader) return next(); // native apps & server-to-server send no Origin; browsers always do on CORS-risky requests

    let origin = '';
    try { origin = new URL(String(originHeader)).origin.toLowerCase(); } catch { origin = ''; }

    const originIsLocal = devLocalAllowed && /^https?:\/\//.test(origin)
      && LOCAL_HOST.test(origin.replace(/^https?:\/\//, ''));

    if (allowedOrigins.has(origin) || originIsLocal) return next();

    return res.status(403).json({ error: 'Request origin is not allowed.' });
  };
}