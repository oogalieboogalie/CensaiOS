import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { createCsrfOriginGuard } from '../server/middleware/security.js';

const APP_ORIGIN = 'http://localhost:5173';

function buildApp() {
  const app = express();
  app.use(createCsrfOriginGuard({ appOrigin: APP_ORIGIN }));
  app.post('/mutation', (_req, res) => res.json({ ok: true }));
  app.post('/api/webhooks/github-agent', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('strict CSRF origin guard', () => {
  const saved = {};

  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    saved.APP_ORIGIN = process.env.APP_ORIGIN;
    saved.CENSAI_MODE = process.env.CENSAI_MODE;
    // The guard's Jest shortcut must not hide these cases.
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = APP_ORIGIN;
    delete process.env.CENSAI_MODE;
  });

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.APP_ORIGIN === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = saved.APP_ORIGIN;
    if (saved.CENSAI_MODE === undefined) delete process.env.CENSAI_MODE;
    else process.env.CENSAI_MODE = saved.CENSAI_MODE;
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

  test('a same-origin fetch site does not excuse a rewritten host', async () => {
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://2130706433:3002')
      .set('Sec-Fetch-Site', 'same-origin');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Request origin is not allowed.');
  });

  test('the desktop shell origin is allowed on this computer', async () => {
    process.env.CENSAI_MODE = 'local_desktop';
    for (const headers of [
      { Origin: 'tauri://localhost' },
      { Origin: 'tauri://localhost', 'Sec-Fetch-Site': 'same-origin' },
      { Origin: 'http://tauri.localhost' },
    ]) {
      const response = await request(buildApp())
        .post('/mutation')
        .set('Host', 'localhost:3001')
        .set(headers);
      expect(response.status).toBe(200);
    }
  });

  test('a private server refuses a tauri origin even when the fetch site says same-origin', async () => {
    process.env.CENSAI_MODE = 'private_server';
    const response = await request(buildApp())
      .post('/mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'tauri://localhost')
      .set('Sec-Fetch-Site', 'same-origin');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Request origin is not allowed.');
  });

  test('userinfo in APP_ORIGIN does not allow the origin after the at-sign', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.use(createCsrfOriginGuard({
      appOrigin: 'http://trusted.example@evil.example',
      apiOrigin: 'http://localhost:3002',
    }));
    app.post('/mutation', (_req, res) => res.json({ ok: true }));
    const stripped = await request(app)
      .post('/mutation')
      .set('Host', 'localhost:3002')
      .set('Origin', 'http://evil.example');
    expect(stripped.status).toBe(403);
    const password = await request(app)
      .post('/mutation')
      .set('Host', 'localhost:3002')
      .set('Origin', 'http://localhost:3002');
    expect(password.status).toBe(200);

    process.env.NODE_ENV = 'development';
    const local = express();
    local.use(createCsrfOriginGuard({ appOrigin: 'http://user:pass@localhost:3002' }));
    local.post('/mutation', (_req, res) => res.json({ ok: true }));
    const strippedLocal = await request(local)
      .post('/mutation')
      .set('Host', 'localhost:3002')
      .set('Origin', 'http://localhost:3002');
    expect(strippedLocal.status).toBe(403);
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

  test('lets a GitHub webhook delivery (no Origin, signed body) reach its own signature check', async () => {
    const response = await request(buildApp())
      .post('/api/webhooks/github-agent')
      .set('Host', 'localhost:3001')
      .set('X-GitHub-Event', 'pull_request');
    expect(response.status).toBe(200);
  });
});
