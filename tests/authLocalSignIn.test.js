// tests/authLocalSignIn.test.js
//
// "Open censaiOS": the one-click sign-in for censaiOS on this computer (the
// laptop install, where Google sign-in is not set up). It must always work on
// a local_desktop server reached at localhost from the same machine, and must
// stay off for cloud and private servers, for other machines, and for other
// host names.

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const query = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query, on: jest.fn() },
}));

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
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

// The sign-in rate limits are covered in authRateLimiting.test.js.
const passThrough = (_req, _res, next) => next();
jest.unstable_mockModule('../server/middleware/rateLimiter.js', () => ({ default: passThrough }));
jest.unstable_mockModule('../server/middleware/standardRateLimits.js', () => ({
  authSecurityRateLimiter: passThrough,
  resourceRateLimiter: passThrough,
}));

const { authRouter } = await import('../server/routes/auth.js');
const { isLocalSignInAllowed, LOCAL_OWNER_EMAIL } = await import('../server/security/authPolicy.js');

let lastSession = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      regenerate: (cb) => cb && cb(),
      save: (cb) => cb && cb(),
    };
    lastSession = req.session;
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

const ENV_KEYS = ['CENSAI_MODE', 'HOMEBASE_MODE', 'CENSAI_ALLOW_DEVELOPER_LOGIN', 'G_CLIENT_ID', 'G_SECRET'];

describe('one-click sign-in on this computer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    lastSession = null;
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CENSAI_MODE = 'local_desktop';
  });

  afterAll(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  test('the login screen is told it is available on a local install', async () => {
    const res = await request(buildApp()).get('/api/auth/session');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: false, oauthConfigured: false, localSignIn: true });
  });

  test('first use makes this computer\'s owner, an admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no admin yet
      .mockResolvedValueOnce({ rows: [] }) // SELECT by email
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // COUNT users
      .mockResolvedValueOnce({ rows: [{ id: 1, email: LOCAL_OWNER_EMAIL, name: 'Alex', role: 'admin' }] });

    const res = await request(buildApp()).post('/api/auth/local').send({ name: 'Alex' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, role: 'admin' });
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO users'));
    expect(insert[1]).toEqual([LOCAL_OWNER_EMAIL, 'Alex', 'admin']);
    expect(lastSession.userId).toBe(1);
  });

  test('later uses sign back in to the existing owner without making a new account', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7, email: 'alex@example.com', name: 'Alex', role: 'admin' }] });

    const res = await request(buildApp()).post('/api/auth/local').send({});

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    expect(lastSession.userRole).toBe('admin');
  });

  test('stays off when the install turns developer sign-in off on purpose', async () => {
    process.env.CENSAI_ALLOW_DEVELOPER_LOGIN = 'false';
    const res = await request(buildApp()).post('/api/auth/local').send({});
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  test.each(['cloud_saas', 'private_server'])('is off on a %s server', async (mode) => {
    process.env.CENSAI_MODE = mode;
    process.env.CENSAI_ALLOW_DEVELOPER_LOGIN = 'true';
    const session = await request(buildApp()).get('/api/auth/session');
    expect(session.body.localSignIn).toBe(false);
    const res = await request(buildApp()).post('/api/auth/local').send({});
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  test('a page reaching the server under another host name is refused', async () => {
    const res = await request(buildApp())
      .post('/api/auth/local')
      .set('Host', 'evil.example:3002')
      .send({});
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  test('another machine on the network is refused', () => {
    const fromLan = { socket: { remoteAddress: '192.168.1.20' }, get: () => 'localhost:3002' };
    const fromHere = { socket: { remoteAddress: '::ffff:127.0.0.1' }, get: () => 'localhost:3002' };
    const env = {};
    expect(isLocalSignInAllowed(fromLan, { env, runtimeMode: 'local_desktop' })).toBe(false);
    expect(isLocalSignInAllowed(fromHere, { env, runtimeMode: 'local_desktop' })).toBe(true);
    const ipv6 = { socket: { remoteAddress: '::1' }, get: () => '[::1]:3002' };
    expect(isLocalSignInAllowed(ipv6, { env, runtimeMode: 'local_desktop' })).toBe(true);
  });
});
