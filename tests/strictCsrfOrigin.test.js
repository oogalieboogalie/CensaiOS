import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { createCsrfOriginGuard } from '../server/middleware/security.js';

const APP_ORIGIN = 'http://localhost:5173';

function buildApp() {
  const app = express();
  app.use(createCsrfOriginGuard({ appOrigin: APP_ORIGIN }));
  app.post('/mutation', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('strict CSRF origin guard', () => {
  const saved = {};

  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    saved.APP_ORIGIN = process.env.APP_ORIGIN;
    // The guard's Jest shortcut must not hide these cases.
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = APP_ORIGIN;
  });

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.APP_ORIGIN === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = saved.APP_ORIGIN;
  });

  test('refuses a state-changing request with no Origin', async () => {
    const response = await request(buildApp()).post('/mutation').set('Host', 'localhost:3001');
    expect(response.status).toBe(403);
  });

  test('refuses a state-changing request from another localhost port', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:49999');
    expect(response.status).toBe(403);
  });

  test('refuses a foreign Origin', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
  });

  test('allows the app origin', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', APP_ORIGIN);
    expect(response.status).toBe(200);
  });

  test('allows a same-origin browser request', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Sec-Fetch-Site', 'same-origin');
    expect(response.status).toBe(200);
  });

  test('boot wires this guard', () => {
    const boot = readFileSync(new URL('../server/boot/middleware.js', import.meta.url), 'utf8');
    expect(boot).toContain("from '../middleware/security.js'");
    expect(boot).not.toContain('csrfOriginGuard');
  });

  test('allows a non-browser client that sends Authorization and no Origin', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Authorization', 'Bearer cak_test');
    expect(response.status).toBe(200);
  });
});
