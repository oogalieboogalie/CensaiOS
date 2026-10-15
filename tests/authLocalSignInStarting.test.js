// tests/authLocalSignInStarting.test.js
//
// The laptop's first start can take minutes before its database is ready.
// While it is, "Open censaiOS" keeps asking; those "still starting" answers
// must not count toward the sign-in rate limits, or the person is locked out
// with "too many attempts" just as censaiOS becomes ready.

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const query = jest.fn();
let ready = false;

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query, on: jest.fn() },
}));

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => ready,
  setDbReady: () => {},
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
  getClientAccessPolicy: () => ({ requiresUserApiKey: false }),
}));

const { authRouter } = await import('../server/routes/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { regenerate: (cb) => cb && cb(), save: (cb) => cb && cb() };
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

describe('one-click sign-in while censaiOS is still starting', () => {
  beforeAll(() => {
    process.env.CENSAI_MODE = 'local_desktop';
  });

  afterAll(() => {
    delete process.env.CENSAI_MODE;
  });

  test('many "still starting" answers do not use up the sign-in attempts', async () => {
    const app = buildApp();
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/auth/local').send({});
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('3');
    }
    expect(query).not.toHaveBeenCalled();

    ready = true;
    query.mockResolvedValueOnce({ rows: [{ id: 3, email: 'owner@this-computer.local', name: 'Owner', role: 'admin' }] });
    const res = await request(app).post('/api/auth/local').send({});
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(3);
  });
});
