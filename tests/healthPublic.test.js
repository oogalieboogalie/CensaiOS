import request from 'supertest';
import { app } from '../server.js';

// Anonymous callers (Docker, CI, a browser with no sign-in) hit these
// probes. The answer may say whether the app is up. It must not name the
// model, where the model lives, or a database error string.

describe('public health probes', () => {
  test('GET /api/health tells an anonymous caller only whether the app is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: expect.any(Boolean) });
  });

  test('GET /api/ready keeps its status code and hides the model address and database error', async () => {
    const res = await request(app).get('/api/ready');
    expect([200, 503]).toContain(res.status);
    expect(typeof res.body.ready).toBe('boolean');
    expect(res.status).toBe(res.body.ready ? 200 : 503);
    expect(res.body.modelProvider?.baseUrl).toBeUndefined();
    expect(res.body.modelProvider?.model).toBeUndefined();
    expect(res.body.database?.error).toBeUndefined();
    expect(res.body.qdrant?.error).toBeUndefined();
  });
});
