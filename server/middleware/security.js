// ── Family Security Constitution ─────────────────────────────────────────────
// 1. Production NEVER has a bypass. The production check comes FIRST, always.
// 2. There is deliberately NO request-controlled bypass. Headers lie.
// 3. Auth limiters FAIL CLOSED. If the rule can't be evaluated, deny.
// 4. The Host header must match an explicit allowlist. Never echo it back.
// 5. Break any rule above and a test below fails. Run npm test before merging.
// ─────────────────────────────────────────────────────────────────────────────

import { getRuntimeMode, RUNTIME_MODES } from './runtimeMode.js';
import { isJestRun } from '../security/testShortcut.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { cameThroughDoor, doorAllowsOrigin } from '../webOs/door.js';
import {
  configuredBrowserOrigin,
  isAllowedBrowserOrigin,
  isAllowedRequestHost,
  originHasUserinfo,
  statedBrowserOrigin,
} from '../security/httpBoundary.js';

const log = createLogger('security');

const SWEEP_MS = 5 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isBypassed() {
  if (process.env.NODE_ENV === 'production') return false; // Rule 1: decided first
  if (isJestRun()) return true;
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
        log.warn('rate limit key failed', { limiter: label, code: safeErrorCode(err) });
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
      log.error('rate limiter failed', { limiter: label, code: safeErrorCode(err) });
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
//
// State-changing requests have to come from this app:
//   Origin equal to APP_ORIGIN or API_ORIGIN — the page, or a script that sets it
//   Sec-Fetch-Site: same-origin — this app's own page (another port is same-site)
//   No Origin, plus Authorization, X-Censai-Agent-Key or X-Api-Bar-Key — MCP,
//     the API bar, and other non-browser clients. A session cookie alone is refused.
//   POST /api/billing/stripe/webhook — Stripe signs the body and sends no Origin
//   POST /api/webhooks/github-agent — GitHub signs the body (HMAC) and sends no Origin
// Jest's own requests are not browsers (isJestRun). NODE_ENV=test alone is not.

const STRIPE_WEBHOOK_PATH = '/api/billing/stripe/webhook';
const GITHUB_AGENT_WEBHOOK_PATH = '/api/webhooks/github-agent';

function explicitNonBrowser(req) {
  if (req.path === STRIPE_WEBHOOK_PATH) return true;
  if (req.path === GITHUB_AGENT_WEBHOOK_PATH && req.method === 'POST') return true;
  if (String(req.get?.('authorization') || '').trim()) return true;
  if (String(req.get?.('x-censai-agent-key') || '').trim()) return true;
  if (String(req.get?.('x-api-bar-key') || '').trim()) return true;
  return false;
}

function parsedOrigin(value) {
  return statedBrowserOrigin(value);
}

export function createCsrfOriginGuard({ appOrigin, apiOrigin } = {}) {
  const front = appOrigin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const back  = apiOrigin  ?? process.env.API_ORIGIN;   // set in prod if API lives on its own host

  const allowedOrigins = new Set();
  for (const raw of [front, back]) {
    if (!raw) continue;
    try { new URL(String(raw)); } catch {
      throw new Error(`[security] Origins must be absolute URLs (got "${raw}"). Fix APP_ORIGIN/API_ORIGIN.`); // fail fast at boot, not mid-request
    }
    // Userinfo is not stripped into a match. An unusable setting adds nothing.
    const origin = configuredBrowserOrigin(raw);
    if (origin) allowedOrigins.add(origin);
  }

  return function csrfOriginGuard(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();

    const host = normalize(req.get('host')).replace(/\/$/, '');
    const originHeader = req.get('origin');
    if (originHasUserinfo(originHeader)) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    const doorOk = Boolean(originHeader) && doorAllowsOrigin(originHeader, host);

    // Rule 4: Host must be someone we serve. Kills DNS rebinding at the door.
    // Dev still accepts a localhost Host because Vite and the API use different ports.
    // Open anywhere has its own check (a faked Host still cannot skip the code).
    if (!isAllowedRequestHost(host, {
      appOrigin: front,
      apiOrigin: back,
      doorOk: doorOk || cameThroughDoor(req),
    })) {
      return res.status(403).json({ error: 'Request host is not allowed.' });
    }

    const site = normalize(req.get('sec-fetch-site'));
    if (site === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request rejected.' });
    }
    // A rewritten or unreadable http host is not this page, even when the
    // client claims Sec-Fetch-Site: same-origin. The desktop shell's tauri
    // origin is not http; it stays on the allow-list and is checked here too,
    // so that shortcut cannot skip it.
    if (originHeader && !statedBrowserOrigin(originHeader)
        && !isAllowedBrowserOrigin(originHeader, { appOrigin: front })) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    // Another localhost port is same-site, not same-origin, and falls through.
    if (site === 'same-origin') return next();

    if (!originHeader) {
      // Jest's supertest calls send no Origin. A browser cannot omit it on a write.
      if (isJestRun() || explicitNonBrowser(req)) return next();
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }

    const origin = parsedOrigin(originHeader);
    // Same list as CORS, including the other two names for this machine when
    // the scheme and port match. Another port is still a different page.
    const browserOk = [front, back].some((configured) =>
      configured && isAllowedBrowserOrigin(originHeader, { appOrigin: configured }));
    if (allowedOrigins.has(origin) || doorOk || browserOk) {
      if (origin) req.csrfOrigin = origin;
      return next();
    }

    return res.status(403).json({ error: 'Request origin is not allowed.' });
  };
}