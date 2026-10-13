import { jest } from '@jest/globals';
import request from 'supertest';

const generateAuthUrl = jest.fn(({ state }) => `https://accounts.example/oauth?state=${state}`);
const getToken = jest.fn();
const setCredentials = jest.fn();
const query = jest.fn();
const saveOAuthCredential = jest.fn();
const getUserInfo = jest.fn();

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
jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  saveOAuthCredential,
}));

const { default: express } = await import('express');
const { authRouter } = await import('../server/routes/auth.js');

describe('Google OAuth route', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.HOMEBASE_MODE;
    delete process.env.CENSAI_MODE;
    delete process.env.ALLOWED_USERS;
    delete process.env.CENSAI_ADMIN_EMAILS;
  });

  test('persists the OAuth state before redirecting to Google', async () => {
    const save = jest.fn((callback) => callback());
    const app = express();
    app.use((req, _res, next) => {
      req.session = { save };
      next();
    });
    app.use('/api/auth', authRouter);

    const response = await request(app).get('/api/auth/google');

    expect(response.status).toBe(302);
    expect(save).toHaveBeenCalledTimes(1);
    expect(generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'select_account consent',
      state: expect.any(String),
    }));
    expect(response.headers.location).toContain('https://accounts.example/oauth?state=');
  });

  test('reports a Google-side authorization error without exchanging a token', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.session = {};
      next();
    });
    app.use('/api/auth', authRouter);

    const response = await request(app)
      .get('/api/auth/google/callback?error=access_denied');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Google authorization was not completed');
    expect(getToken).not.toHaveBeenCalled();
  });

  test('stores OAuth credentials through the encrypted store without session tokens', async () => {
    getToken.mockResolvedValue({
      tokens: {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expiry_date: 123,
        scope: 'calendar',
      },
    });
    getUserInfo.mockResolvedValue({
      data: { email: 'user@example.com', name: 'User' },
    });
    query.mockResolvedValueOnce({
      rows: [{ id: 7, email: 'user@example.com', name: 'User', role: 'user' }],
    });
    const save = jest.fn((callback) => callback());
    const regenerate = jest.fn((callback) => callback());
    const session = { oauth_state: 'valid-state', save, regenerate };
    const app = express();
    app.use((req, _res, next) => {
      req.session = session;
      next();
    });
    app.use('/api/auth', authRouter);

    const response = await request(app)
      .get('/api/auth/google/callback?code=code&state=valid-state');

    expect(response.status).toBe(302);
    expect(saveOAuthCredential).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      provider: 'google',
      tokens: expect.objectContaining({ refresh_token: 'refresh-secret' }),
    }));
    expect(session.googleTokens).toBeUndefined();
    expect(session.userId).toBe(7);
    expect(session.userEmail).toBe('user@example.com');
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  test('tells the client whether the active deployment requires BYOK', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';
    process.env.ALLOWED_USERS = 'user@example.com';
    query.mockResolvedValueOnce({
      rows: [{ id: 7, email: 'user@example.com', name: 'User', role: 'user' }],
    });
    const app = express();
    app.use((req, _res, next) => {
      req.session = { userId: 7 };
      next();
    });
    app.use('/api/auth', authRouter);

    const response = await request(app).get('/api/auth/session');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authenticated: true,
      runtimeMode: 'cloud_saas',
      requiresUserApiKey: true,
    });
  });
});
