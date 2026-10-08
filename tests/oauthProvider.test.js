import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  saveOAuthCredential: jest.fn(),
  getOAuthCredential: jest.fn(),
}));

const { saveOAuthCredential, getOAuthCredential } = await import('../server/credentials/oauthStore.js');
const { oauthRouter } = await import('../server/routes/oauth.js');
const {
  registerOAuthProvider,
  getOAuthProvider,
  listOAuthProviders,
  clearOAuthProvidersForTests,
} = await import('../server/providers/oauthProvider.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/oauth', oauthRouter);
  return a;
}

const PROVIDER = 'test-notion';

beforeEach(() => {
  clearOAuthProvidersForTests();
  process.env.TEST_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.TEST_OAUTH_CLIENT_SECRET = 'test-client-secret';
  saveOAuthCredential.mockReset();
  getOAuthCredential.mockReset();
  registerOAuthProvider({
    id: PROVIDER,
    label: 'Test Notion',
    authorizationUrl: 'https://example.com/oauth/authorize',
    tokenUrl: 'https://example.com/oauth/token',
    apiBaseUrl: 'https://example.com/api',
    scopes: ['read', 'write'],
    capabilities: ['notion.read', 'notion.write'],
    clientIdEnv: 'TEST_OAUTH_CLIENT_ID',
    clientSecretEnv: 'TEST_OAUTH_CLIENT_SECRET',
    exchangeCodeForToken: async () => ({
      access_token: 'SECRET-ACCESS',
      refresh_token: 'SECRET-REFRESH',
      scope: 'read write',
    }),
    refreshToken: async () => ({ access_token: 'SECRET-ACCESS-2' }),
  });
});

afterEach(() => {
  delete process.env.TEST_OAUTH_CLIENT_ID;
  delete process.env.TEST_OAUTH_CLIENT_SECRET;
});

describe('provider registry validation', () => {
  test('rejects bad ids and non-function overrides', () => {
    expect(() => registerOAuthProvider({ id: '../evil' })).toThrow();
    expect(() => registerOAuthProvider({ id: 'ok-id', getApiBaseUrl: 'not-a-function' })).toThrow();
    expect(getOAuthProvider('../evil')).toBeNull();
  });

  test('lists metadata without secrets', () => {
    const list = listOAuthProviders();
    const entry = list.find((p) => p.id === PROVIDER);
    expect(entry.label).toBe('Test Notion');
    expect(entry.configured).toBe(true);
    expect(JSON.stringify(entry)).not.toContain('SECRET');
    expect(JSON.stringify(entry)).not.toContain('test-client-secret');
  });
});

describe('GET /api/oauth/:provider/authorize', () => {
  test('builds the auth URL with state, client id, and scopes', async () => {
    const res = await request(app())
      .get(`/api/oauth/${PROVIDER}/authorize`)
      .query({ redirectUri: 'https://app.local/oauth/callback' });
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('read');
    expect(url.searchParams.get('state')).toBe(res.body.state);
    expect(typeof res.body.state).toBe('string');
  });

  test('404s unknown providers and 400s a missing redirectUri', async () => {
    const a = app();
    expect((await request(a).get('/api/oauth/nope/authorize').query({ redirectUri: 'https://x' })).status).toBe(404);
    expect((await request(a).get(`/api/oauth/${PROVIDER}/authorize`)).status).toBe(400);
  });
});

describe('GET /api/oauth/:provider/callback', () => {
  async function freshState() {
    const r = await request(app())
      .get(`/api/oauth/${PROVIDER}/authorize`)
      .query({ redirectUri: 'https://app.local/oauth/callback' });
    return r.body.state;
  }

  test('exchanges the code, stores via the vault, and never leaks tokens', async () => {
    const state = await freshState();
    const res = await request(app())
      .get(`/api/oauth/${PROVIDER}/callback`)
      .query({ code: 'auth-code-123', state, userId: 'user-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, provider: PROVIDER, scope: 'read write' });
    expect(saveOAuthCredential).toHaveBeenCalledTimes(1);
    expect(saveOAuthCredential).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: PROVIDER,
      tokens: expect.objectContaining({ access_token: 'SECRET-ACCESS' }),
    });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  test('rejects reused, foreign, and missing states and identities', async () => {
    const a = app();
    const state = await freshState();
    const good = { code: 'c', state, userId: 'user-1' };
    expect((await request(a).get(`/api/oauth/${PROVIDER}/callback`).query(good)).status).toBe(200);
    expect((await request(a).get(`/api/oauth/${PROVIDER}/callback`).query(good)).status).toBe(403);
    expect((await request(a).get(`/api/oauth/${PROVIDER}/callback`).query({ code: 'c', state: 'bogus', userId: 'user-1' })).status).toBe(403);
    expect((await request(a).get(`/api/oauth/${PROVIDER}/callback`).query({ code: 'c', state: await freshState() })).status).toBe(400);
  });
});

describe('POST /api/oauth/:provider/refresh', () => {
  test('refreshes through the vault without leaking tokens', async () => {
    getOAuthCredential.mockResolvedValue({ access_token: 'OLD', refresh_token: 'OLD-REFRESH', scope: 'read' });
    const res = await request(app())
      .post(`/api/oauth/${PROVIDER}/refresh`)
      .send({ userId: 'user-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, provider: PROVIDER });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(saveOAuthCredential).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      tokens: expect.objectContaining({ access_token: 'SECRET-ACCESS-2', refresh_token: 'OLD-REFRESH' }),
    }));
  });

  test('409s when nothing is stored and 404s unknown providers', async () => {
    getOAuthCredential.mockResolvedValue(null);
    const a = app();
    expect((await request(a).post(`/api/oauth/${PROVIDER}/refresh`).send({ userId: 'user-1' })).status).toBe(409);
    expect((await request(a).post('/api/oauth/nope/refresh').send({ userId: 'user-1' })).status).toBe(404);
  });
});
