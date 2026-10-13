// tests/webOsPairing.test.js
//
// "Add a computer" (Open anywhere): a code made on the main computer signs
// one other computer in as the same person, once, within ten minutes. Email
// sign-in is refused from another computer.

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query, on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true, setDbReady: () => {} }));
const passThrough = (_req, _res, next) => next();
jest.unstable_mockModule('../server/middleware/standardRateLimits.js', () => ({
  authSecurityRateLimiter: passThrough,
  resourceRateLimiter: passThrough,
}));

const { createPairCode, redeemPairCode, clearPairCodes, PAIR_CODE_TTL_MS } = await import('../server/webOs/pairing.js');
const { webOsPublicRouter, webOsRouter, refuseEmailSignInFromAnotherComputer } = await import('../server/routes/webOs.js');

let lastSession = null;
function buildApp(sessionUser = null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { ...(sessionUser || {}), regenerate: (cb) => cb(), save: (cb) => cb() };
    lastSession = req.session;
    next();
  });
  app.post('/api/auth/developer', refuseEmailSignInFromAnotherComputer, (_req, res) => res.json({ ok: true }));
  app.use('/api/web-os', webOsPublicRouter);
  app.use('/api/web-os', webOsRouter);
  return app;
}

beforeEach(() => {
  clearPairCodes();
  query.mockReset();
});

describe('pair codes', () => {
  test('work once', () => {
    const { code } = createPairCode(7);
    expect(redeemPairCode(code)).toEqual({ userId: 7 });
    expect(redeemPairCode(code)).toBeNull();
  });

  test('run out after ten minutes', () => {
    const now = Date.now();
    const { code } = createPairCode(7, { now });
    expect(redeemPairCode(code, { now: now + PAIR_CODE_TTL_MS + 1 })).toBeNull();
  });

  test('refuse made-up codes', () => {
    expect(redeemPairCode('x')).toBeNull();
    expect(redeemPairCode('a'.repeat(24))).toBeNull();
    expect(redeemPairCode(undefined)).toBeNull();
  });

  test('keep only the newest five per person', () => {
    const first = createPairCode(7, { now: 1 }).code;
    for (let i = 2; i <= 6; i += 1) createPairCode(7, { now: i });
    expect(redeemPairCode(first, { now: 10 })).toBeNull();
  });
});

describe('Open anywhere routes', () => {
  test('a code made while signed in signs another computer in as the same person', async () => {
    const owner = buildApp({ userId: 7, userRole: 'admin' });
    const made = await request(owner).post('/api/web-os/pair').send({});
    expect(made.status).toBe(200);
    query.mockResolvedValueOnce({ rows: [{ id: 7, email: 'alex@example.com', name: 'Alex', role: 'admin' }] });
    const other = buildApp();
    const res = await request(other).post('/api/web-os/pair/redeem').set('Host', 'r2d2:3002').send({ code: made.body.code });
    expect(res.status).toBe(200);
    expect(lastSession.userId).toBe(7);
    const again = await request(buildApp()).post('/api/web-os/pair/redeem').send({ code: made.body.code });
    expect(again.status).toBe(400);
  });

  test('making a code needs a signed-in person', async () => {
    const res = await request(buildApp()).post('/api/web-os/pair').send({});
    expect(res.status).toBe(401);
  });

  test('email sign-in is refused from another computer, kept on this one', async () => {
    const app = buildApp();
    const remote = await request(app).post('/api/auth/developer').set('Host', '192.168.1.23:3002').send({ email: 'a@b.c' });
    expect(remote.status).toBe(403);
    expect(remote.body.pairRequired).toBe(true);
    const local = await request(app).post('/api/auth/developer').set('Host', 'localhost:3002').send({ email: 'a@b.c' });
    expect(local.status).toBe(200);
  });

  test('the status says whether this request came from another computer', async () => {
    const res = await request(buildApp({ userId: 7 })).get('/api/web-os').set('Host', 'r2d2:3002');
    expect(res.status).toBe(200);
    expect(res.body.fromAnotherComputer).toBe(true);
    expect(typeof res.body.open).toBe('boolean');
  });
});
