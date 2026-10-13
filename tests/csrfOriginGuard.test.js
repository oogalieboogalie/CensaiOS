import express from 'express';
import request from 'supertest';
import { createCsrfOriginGuard } from '../server/middleware/csrfOriginGuard.js';

function buildApp() {
  const app = express();
  app.use(createCsrfOriginGuard({ appOrigin: 'https://app.example.com' }));
  app.all('/mutation', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('CSRF origin guard', () => {
  test('allows safe methods regardless of Origin', async () => {
    const response = await request(buildApp()).get('/mutation').set('Origin', 'https://evil.example');
    expect(response.status).toBe(200);
  });

  test('allows mutations from the configured app origin', async () => {
    const response = await request(buildApp()).post('/mutation').set('Origin', 'https://app.example.com');
    expect(response.status).toBe(200);
  });

  test('rejects mutations from a foreign browser origin', async () => {
    const response = await request(buildApp()).post('/mutation').set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
  });

  test('rejects browser requests explicitly marked cross-site', async () => {
    const response = await request(buildApp()).post('/mutation').set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(403);
  });

  test('allows native clients without browser Origin headers', async () => {
    const response = await request(buildApp()).post('/mutation');
    expect(response.status).toBe(200);
  });
});
