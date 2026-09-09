// tests/authRateLimiting.test.js
//
// Four-tier coverage for the in-memory authentication rate limiter.
//
//   Tier 1 — Feature behavior       (basic cap and 429 contract)
//   Tier 2 — Boundary conditions    (limit precision, IP isolation, window reset, header bounds)
//   Tier 3 — Cross-feature          (untrusted headers, local env bypass, reset function)
//   Tier 4 — Real-world through-router (mixed traffic across /google,
//                                       /google/callback, /developer shares one counter per IP)
//
// SCOPE: This suite invokes /api/auth/google, /api/auth/google/callback,
// and /api/auth/developer per the Interface Contracts in
// .agents/sub_orch_e2e_testing/SCOPE.md.

import { jest } from '@jest/globals';
import request from 'supertest';

const generateAuthUrl = jest.fn(({ state }) => `https://accounts.example/oauth?state=${state}`);
const getToken = jest.fn();
const setCredentials = jest.fn();
const getUserInfo = jest.fn();
const query = jest.fn();
const saveOAuthCredential = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({ generateAuthUrl, getToken, setCredentials })),
    },
    oauth2: jest.fn(() => ({ userinfo: { get: getUserInfo } })),
  },
}));

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));

// Pretend the DB is ready for the rate-limit suite. The dbReady() branch is
// tested separately in tests/dbReadiness.test.js; rate-limiting here is
// agnostic to it.
jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
  setDbReady: () => {},
}));

jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  saveOAuthCredential,
}));

const express = (await import('express')).default;
const rateLimiterModule = await import('../server/middleware/rateLimiter.js');
const rateLimiter = rateLimiterModule.default;
const { resetRateLimiter, disposeRateLimiter, MAX_REQUESTS, WINDOW_MS } = rateLimiterModule;
const { authRouter } = await import('../server/routes/auth.js');

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a tiny express app with the middleware mounted on a stub route. */
function buildIsolationApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, _res, next) => { req.session = { save: (cb) => cb && cb() }; next(); });
  app.use('/test', rateLimiter, (req, res) => res.status(200).json({ ok: true, path: req.path }));
  return app;
}

/** Build an app that mounts the real authRouter under /api/auth. */
function buildAuthApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { save: (cb) => cb && cb() };
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

/** Fire N requests from a given IP. Returns the array of responses. */
async function fireRequests(app, path, { ip, count, method = 'get', body, headers = {} } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const reqBuilder = request(app)[method](path)
      .set('X-Forwarded-For', ip)
      .set('Host', 'localhost');
    for (const [k, v] of Object.entries(headers)) reqBuilder.set(k, v);
    if (body) reqBuilder.send(body);
    out.push(await reqBuilder);
  }
  return out;
}

// ─── Global hooks ───────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  delete process.env.RATE_LIMIT_DISABLED;
  delete process.env.CENSAI_MODE;
  delete process.env.HOMEBASE_MODE;
});

afterAll(() => {
  disposeRateLimiter();
  delete process.env.RATE_LIMIT_DISABLED;
  delete process.env.CENSAI_MODE;
  delete process.env.HOMEBASE_MODE;
});

// ─── Tier 1: Feature behavior ───────────────────────────────────────

describe('Tier 1 — Feature behavior', () => {
  test('first five requests from one IP pass through to next handler', async () => {
    const app = buildIsolationApp();
    const responses = await fireRequests(app, '/test', { ip: '203.0.113.10', count: 5 });

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses.every((r) => r.body.ok === true)).toBe(true);
  });

  test('sixth request from same IP returns 429 with Retry-After header and JSON body', async () => {
    const app = buildIsolationApp();
    const warmup = await fireRequests(app, '/test', { ip: '203.0.113.20', count: 5 });
    expect(warmup.every((r) => r.status === 200)).toBe(true);

    const blocked = await fireRequests(app, '/test', { ip: '203.0.113.20', count: 1 });

    expect(blocked[0].status).toBe(429);
    expect(blocked[0].headers['retry-after']).toBeDefined();
    const retryAfter = Number(blocked[0].headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);

    expect(blocked[0].body).toMatchObject({
      error: expect.stringMatching(/too many login attempts/i),
      retryAfter: expect.any(Number),
    });
    expect(blocked[0].body.retryAfter).toBe(retryAfter);
  });
});

// ─── Tier 2: Boundary conditions ────────────────────────────────────

describe('Tier 2 — Boundary conditions', () => {
  test('limit precision: exactly N pass, N+1 is blocked (verifies MAX_REQUESTS = 5)', async () => {
    expect(MAX_REQUESTS).toBe(5);
    const app = buildIsolationApp();

    const passing = await fireRequests(app, '/test', { ip: '198.51.100.1', count: MAX_REQUESTS });
    expect(passing.every((r) => r.status === 200)).toBe(true);

    const blocked = await fireRequests(app, '/test', { ip: '198.51.100.1', count: 1 });
    expect(blocked[0].status).toBe(429);
  });

  test('IP isolation: different IPs have independent counters', async () => {
    const app = buildIsolationApp();

    // IP A burns its budget
    const aBurned = await fireRequests(app, '/test', { ip: '198.51.100.10', count: 6 });
    expect(aBurned[5].status).toBe(429);

    // IP B is untouched and gets full budget
    const bFresh = await fireRequests(app, '/test', { ip: '198.51.100.11', count: 5 });
    expect(bFresh.every((r) => r.status === 200)).toBe(true);
  });

  test('raw forwarding headers cannot rotate identity when proxy trust is off', async () => {
    const app = express();
    app.use('/test', rateLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`);
      statuses.push(response.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(Object.keys(rateLimiter.snapshot())).toHaveLength(1);
  });

  test('after window elapses, the counter resets and fresh requests succeed', async () => {
    const base = 1_700_000_000_000;
    jest.useFakeTimers({ now: base });

    try {
      const app = buildIsolationApp();

      const warmup = await fireRequests(app, '/test', { ip: '198.51.100.20', count: 5 });
      expect(warmup.every((r) => r.status === 200)).toBe(true);

      const blocked = await request(app).get('/test').set('X-Forwarded-For', '198.51.100.20');
      expect(blocked.status).toBe(429);

      // Advance past the 60s window.
      jest.setSystemTime(base + WINDOW_MS + 1000);

      const afterReset = await request(app).get('/test').set('X-Forwarded-For', '198.51.100.20');
      expect(afterReset.status).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });

  test('Retry-After value is bounded: 1 ≤ retryAfter ≤ WINDOW_MS/1000', async () => {
    const app = buildIsolationApp();
    await fireRequests(app, '/test', { ip: '198.51.100.30', count: 5 });

    const blocked = await request(app).get('/test').set('X-Forwarded-For', '198.51.100.30');
    const retryAfter = Number(blocked.headers['retry-after']);

    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});

// ─── Tier 3: Cross-feature (bypass) ────────────────────────────────

describe('Tier 3 — Cross-feature (bypass)', () => {
  test.each([
    ['1'],
    ['true'],
    ['TRUE'],
    ['yes'],
    ['on'],
  ])('X-Bypass-Rate-Limit: %s is untrusted and cannot bypass the limiter', async (value) => {
    const app = buildIsolationApp();

    // Burn the budget with normal requests
    await fireRequests(app, '/test', { ip: '198.51.100.40', count: 5 });

    // A caller-controlled header cannot restore exhausted capacity.
    const bypassed = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '198.51.100.40')
      .set('X-Bypass-Rate-Limit', value);

    expect(bypassed.status).toBe(429);
  });

  test('missing or empty X-Bypass-Rate-Limit does NOT bypass', async () => {
    const app = buildIsolationApp();
    await fireRequests(app, '/test', { ip: '198.51.100.41', count: 5 });

    const noHeader = await request(app).get('/test').set('X-Forwarded-For', '198.51.100.41');
    expect(noHeader.status).toBe(429);

    const emptyHeader = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '198.51.100.41')
      .set('X-Bypass-Rate-Limit', '');
    expect(emptyHeader.status).toBe(429);
  });

  test('bypass header is counted like ordinary traffic', async () => {
    const app = buildIsolationApp();

    const responses = [];
    for (let i = 0; i < 6; i += 1) {
      responses.push(await request(app)
        .get('/test')
        .set('X-Forwarded-For', '198.51.100.42')
        .set('X-Bypass-Rate-Limit', 'true'));
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 429]);
    const snapshot = rateLimiter.snapshot();
    expect(snapshot['198.51.100.42'].count).toBe(5);
  });

  test('process.env.RATE_LIMIT_DISABLED="true" bypasses the limiter', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    const app = buildIsolationApp();

    // Even without sending the header, every request should pass — 20 of them.
    const responses = await fireRequests(app, '/test', { ip: '198.51.100.43', count: 20 });
    expect(responses.every((r) => r.status === 200)).toBe(true);

    // And the counter is empty (env bypass does not increment).
    const snapshot = rateLimiter.snapshot();
    expect(snapshot['198.51.100.43']).toBeUndefined();
  });

  test('header bypass is ignored in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = buildIsolationApp();
      await fireRequests(app, '/test', { ip: '198.51.100.45', count: 5 });
      const blocked = await request(app)
        .get('/test')
        .set('X-Forwarded-For', '198.51.100.45')
        .set('X-Bypass-Rate-Limit', 'true');
      expect(blocked.status).toBe(429);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('resetRateLimiter() clears the store and immediately restores capacity', async () => {
    const app = buildIsolationApp();
    const burned = await fireRequests(app, '/test', { ip: '198.51.100.44', count: 6 });
    expect(burned[5].status).toBe(429);

    resetRateLimiter();

    const after = await fireRequests(app, '/test', { ip: '198.51.100.44', count: 5 });
    expect(after.every((r) => r.status === 200)).toBe(true);
  });
});

// ─── Tier 4: Real-world through-router ─────────────────────────────

describe('Tier 4 — Real-world through the authRouter', () => {
  test('mixed traffic across /google, /google/callback, /developer shares ONE counter per IP', async () => {
    const app = buildAuthApp();
    const ip = '203.0.113.99';

    // Pre-seed: handle any DB queries that the callbacks/handlers raise
    query.mockResolvedValue({ rows: [] });
    getUserInfo.mockResolvedValue({ data: { email: 'u@example.com', name: 'U' } });
    getToken.mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r', scope: 's' } });

    // 2 hits on /developer
    const r1 = await request(app).post('/api/auth/developer')
      .set('X-Forwarded-For', ip).send({ email: 'u@example.com' });
    const r2 = await request(app).post('/api/auth/developer')
      .set('X-Forwarded-For', ip).send({ email: 'u@example.com' });

    // 2 hits on /google
    const r3 = await request(app).get('/api/auth/google').set('X-Forwarded-For', ip);
    const r4 = await request(app).get('/api/auth/google').set('X-Forwarded-For', ip);

    // 1 hit on /google/callback
    const r5 = await request(app)
      .get('/api/auth/google/callback?code=c&state=s')
      .set('X-Forwarded-For', ip);

    // None of these are 429 — they consumed the budget of 5
    expect([r1, r2, r3, r4, r5].map((r) => r.status)).not.toContain(429);

    // 6th request, on any of the three routes, must be 429
    const r6a = await request(app).get('/api/auth/google').set('X-Forwarded-For', ip);
    expect(r6a.status).toBe(429);
    expect(r6a.headers['retry-after']).toBeDefined();
    expect(r6a.body).toMatchObject({
      error: expect.stringMatching(/too many login attempts/i),
      retryAfter: expect.any(Number),
    });

    const r6b = await request(app).post('/api/auth/developer')
      .set('X-Forwarded-For', ip).send({ email: 'u@example.com' });
    expect(r6b.status).toBe(429);

    const r6c = await request(app)
      .get('/api/auth/google/callback?code=c&state=s')
      .set('X-Forwarded-For', ip);
    expect(r6c.status).toBe(429);
  });

  test('different IPs hitting the same endpoints do not interfere with each other', async () => {
    const app = buildAuthApp();
    query.mockResolvedValue({ rows: [] });

    // IP A burns its 5 budget on /developer
    const a = await fireRequests(app, '/api/auth/developer', {
      ip: '203.0.113.50', count: 6, method: 'post', body: { email: 'a@example.com' },
    });
    expect(a[5].status).toBe(429);

    // IP B is still fresh
    const b = await fireRequests(app, '/api/auth/developer', {
      ip: '203.0.113.51', count: 5, method: 'post', body: { email: 'b@example.com' },
    });
    expect(b.every((r) => r.status !== 429)).toBe(true);
  });
});
