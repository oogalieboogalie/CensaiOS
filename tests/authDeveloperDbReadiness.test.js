// tests/authDeveloperDbReadiness.test.js
//
// Targeted coverage for the /api/auth/developer handler's dbReady() guard.
// Before the fix, the handler went straight to pool.query() and bubbled a 500
// when the schema bootstrap was still running. The guard turns that into a
// clean 503 with a Retry-After header, and the client retries.

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const query = jest.fn();
let isReady = true;

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query, on: jest.fn() },
}));

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => isReady,
  setDbReady: (v) => { isReady = v; },
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => ({})) },
    oauth2: jest.fn(() => ({ userinfo: { get: jest.fn() } })),
  },
}));

jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  saveOAuthCredential: jest.fn(),
}));

jest.unstable_mockModule('../server/security/byokPolicy.js', () => ({
  getClientAccessPolicy: () => ({ canUseByok: true, canPublish: false }),
}));

const { authRouter } = await import('../server/routes/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Minimal session stub mirroring authRateLimiting.test.js — the real session
  // middleware is irrelevant to the dbReady check we're testing here.
  app.use((req, _res, next) => {
    req.session = {
      regenerate: (cb) => cb && cb(),
      save: (cb) => cb && cb(),
    };
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

describe('/api/auth/developer dbReady guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isReady = true;
    delete process.env.CENSAI_MODE;
    delete process.env.HOMEBASE_MODE;
    delete process.env.CENSAI_ALLOW_DEVELOPER_LOGIN;
  });

  afterAll(() => {
    delete process.env.CENSAI_MODE;
    delete process.env.HOMEBASE_MODE;
    delete process.env.CENSAI_ALLOW_DEVELOPER_LOGIN;
  });

  test('returns 503 + Retry-After when dbReady() is false', async () => {
    isReady = false;
    const res = await request(buildApp())
      .post('/api/auth/developer')
      .send({ email: 'alex@example.com' });
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('2');
    expect(res.body).toEqual({ error: expect.stringMatching(/database initializing/i) });
    // Critical: pool.query must not be called when the DB isn't ready.
    expect(query).not.toHaveBeenCalled();
  });

  test('proceeds to pool.query when dbReady() is true', async () => {
    isReady = true;
    // First call: SELECT returns no existing user; second call: count = 0 → admin role;
    // third call: INSERT returns new user.
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT user
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // COUNT users
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'alex@example.com', name: 'alex', role: 'admin' }] }); // INSERT user

    const res = await request(buildApp())
      .post('/api/auth/developer')
      .send({ email: 'alex@example.com', name: 'Alex' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(query).toHaveBeenCalled();
  });

  test('cloud mode denies developer login even when explicitly requested', async () => {
    process.env.CENSAI_MODE = 'cloud_saas';
    process.env.CENSAI_ALLOW_DEVELOPER_LOGIN = 'true';

    const res = await request(buildApp())
      .post('/api/auth/developer')
      .send({ email: 'alex@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
    expect(query).not.toHaveBeenCalled();
  });
});
