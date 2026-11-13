// The OAuth routes must save and refresh tokens for the signed-in person only.
// Before this fix, a userId in the request picked whose stored login got
// overwritten, so one person could plant their own Google login on someone else.
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  saveOAuthCredential: jest.fn(),
  getOAuthCredential: jest.fn(),
}));

const { saveOAuthCredential, getOAuthCredential } = await import('../server/credentials/oauthStore.js');
const { oauthRouter } = await import('../server/routes/oauth.js');
const { registerOAuthProvider, clearOAuthProvidersForTests } = await import('../server/providers/oauthProvider.js');

const PROVIDER = 'test-session-oauth';

function appAs(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/oauth', oauthRouter);
  return a;
}

beforeEach(() => {
  clearOAuthProvidersForTests();
  process.env.TEST_SESSION_OAUTH_ID = 'id';
  process.env.TEST_SESSION_OAUTH_SECRET = 'secret';
  saveOAuthCredential.mockReset();
  getOAuthCredential.mockReset();
  registerOAuthProvider({
    id: PROVIDER,
    authorizationUrl: 'https://example.com/oauth/authorize',
    tokenUrl: 'https://example.com/oauth/token',
    clientIdEnv: 'TEST_SESSION_OAUTH_ID',
    clientSecretEnv: 'TEST_SESSION_OAUTH_SECRET',
    exchangeCodeForToken: async () => ({ access_token: 'A', refresh_token: 'R' }),
    refreshToken: async () => ({ access_token: 'A2' }),
  });
});

afterEach(() => {
  delete process.env.TEST_SESSION_OAUTH_ID;
  delete process.env.TEST_SESSION_OAUTH_SECRET;
});

async function startAs(a) {
  const res = await request(a).get(`/api/oauth/${PROVIDER}/authorize`).query({ redirectUri: 'https://app.example/cb' });
  return res.body.state;
}

test('callback saves the login for the signed-in person, not a userId in the request', async () => {
  const sam = appAs(11);
  const state = await startAs(sam);
  const res = await request(sam).get(`/api/oauth/${PROVIDER}/callback`).query({ code: 'c', state, userId: '22' });
  expect(res.status).toBe(200);
  expect(saveOAuthCredential).toHaveBeenCalledTimes(1);
  expect(saveOAuthCredential.mock.calls[0][0].userId).toBe('11');
});

test('a sign-in started by one person cannot be finished by another', async () => {
  const state = await startAs(appAs(11));
  const res = await request(appAs(22)).get(`/api/oauth/${PROVIDER}/callback`).query({ code: 'c', state });
  expect(res.status).toBe(403);
  expect(saveOAuthCredential).not.toHaveBeenCalled();
});

test('refresh only touches the signed-in person\'s stored login', async () => {
  getOAuthCredential.mockResolvedValue({ refresh_token: 'R' });
  const res = await request(appAs(11)).post(`/api/oauth/${PROVIDER}/refresh`).send({ userId: '22' });
  expect(res.status).toBe(200);
  expect(getOAuthCredential.mock.calls[0][0].userId).toBe('11');
  expect(saveOAuthCredential.mock.calls[0][0].userId).toBe('11');
});

test('no sign-in, no OAuth', async () => {
  const a = appAs(null);
  expect((await request(a).get(`/api/oauth/${PROVIDER}/authorize`).query({ redirectUri: 'https://x/cb' })).status).toBe(401);
  expect((await request(a).post(`/api/oauth/${PROVIDER}/refresh`).send({ userId: '22' })).status).toBe(401);
});
