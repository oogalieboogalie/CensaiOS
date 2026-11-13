import express from 'express';
import request from 'supertest';
import { createCsrfOriginGuard } from '../server/middleware/security.js';

function buildApp() {
  const app = express();
  app.use(createCsrfOriginGuard({ appOrigin: 'https://app.example.com' }));
  app.all('/mutation', (req, res) => res.json({ ok: true, csrfOrigin: req.csrfOrigin || null }));
  return app;
}

describe('CSRF origin guard', () => {
  const saved = {};
  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });
  afterEach(() => { process.env.NODE_ENV = saved.NODE_ENV; });

  test('allows safe methods regardless of Origin', async () => {
    const response = await request(buildApp()).get('/mutation').set('Origin', 'https://evil.example');
    expect(response.status).toBe(200);
  });

  test('allows mutations from the configured app origin', async () => {
    const response = await request(buildApp()).post('/mutation').set('Origin', 'https://app.example.com');
    expect(response.status).toBe(200);
    expect(response.body.csrfOrigin).toBe('https://app.example.com');
  });

  test('rejects mutations from a foreign browser origin', async () => {
    const response = await request(buildApp()).post('/mutation').set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
  });

  test('rejects browser requests explicitly marked cross-site', async () => {
    const response = await request(buildApp()).post('/mutation').set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(403);
  });

  test('refuses a mutation with no Origin', async () => {
    const response = await request(buildApp()).post('/mutation');
    expect(response.status).toBe(403);
  });

  test('allows a non-browser client that names itself with Authorization', async () => {
    const response = await request(buildApp()).post('/mutation').set('Authorization', 'Bearer cak_test');
    expect(response.status).toBe(200);
  });
});
