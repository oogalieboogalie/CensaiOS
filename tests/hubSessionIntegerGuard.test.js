import express from 'express';
import request from 'supertest';
import { mountRouters } from '../server/boot/routers.js';

const HUB_ID = '11111111-1111-4111-8111-111111111111';

// The real /api guard in routers.js, not a copy of it. Jest's "everyone is
// user 1" shortcut is off for these requests, so that guard actually runs.
describe('old hub sessions fail the real API guard', () => {
  const worker = process.env.JEST_WORKER_ID;

  afterEach(() => {
    process.env.JEST_WORKER_ID = worker;
  });

  test('an unmarked hub-style userId is refused and an integer user is not', async () => {
    delete process.env.JEST_WORKER_ID;
    const session = { userId: HUB_ID, userRole: 'admin', userEmail: 'alma@example.com' };
    const app = express();
    app.use((req, _res, next) => {
      req.session = session;
      next();
    });
    mountRouters(app);
    app.get('/api/guard-probe', (req, res) => res.json({ ok: true, userId: req.session.userId }));

    const denied = await request(app).get('/api/guard-probe');
    expect(denied.status).toBe(403);
    expect(denied.body.ok).toBeUndefined();

    session.userId = 7;
    const allowed = await request(app).get('/api/guard-probe');
    expect(allowed.status).toBe(200);
    expect(allowed.body.userId).toBe(7);
  });
});
