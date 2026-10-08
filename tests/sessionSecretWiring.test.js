import express from 'express';
import signature from 'cookie-signature';
import { setupMiddleware } from '../server/boot/middleware.js';
import { defaultAuthenticate } from '../server/ws/agentRegistry.js';

// Regression: with SESSION_SECRET unset (allowed in local dev), express-session
// signed cookies with a random fallback while WebSocket upgrades verified them
// against the empty env var, so every collaboration/CRDT socket got a 401.
describe('session secret wiring for WebSocket auth', () => {
  const saved = process.env.SESSION_SECRET;
  beforeEach(() => { delete process.env.SESSION_SECRET; });
  afterAll(() => {
    if (saved === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = saved;
  });

  test('exposes the secret express-session signs with, even when the env is empty', () => {
    const app = express();
    setupMiddleware(app);
    expect(app.get('sessionSecret')).toEqual(expect.any(String));
    expect(app.get('sessionSecret').length).toBeGreaterThanOrEqual(32);
  });

  test('upgrade auth accepts a cookie signed with that secret', async () => {
    const app = express();
    setupMiddleware(app);
    const secret = app.get('sessionSecret');
    const sid = 'sess-abc';
    const cookie = `connect.sid=${encodeURIComponent(`s:${signature.sign(sid, secret)}`)}`;
    const sessionStore = {
      get: (id, cb) => cb(null, id === sid ? { userId: 1, userEmail: 'a@example.com' } : null),
    };
    const actor = await defaultAuthenticate({ headers: { cookie } }, { sessionStore, sessionSecret: secret });
    expect(actor).toEqual(expect.objectContaining({ userId: '1' }));
  });
});
