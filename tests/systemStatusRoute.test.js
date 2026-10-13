import request from 'supertest';
import express from 'express';
import { systemStatusRouter } from '../server/routes/systemStatus.js';

function mount() {
  const app = express();
  app.use('/api/system', systemStatusRouter);
  return app;
}

describe('system status route', () => {
  test('serves the widget payload at /api/system/status', async () => {
    const res = await request(mount()).get('/api/system/status');
    expect(res.status).toBe(200);
    expect(res.body.host.uptime_human).toMatch(/\d+d \d+h \d+m/);
    expect(typeof res.body.host.total_mem).toBe('number');
    expect(typeof res.body.now).toBe('string');
  });

  test('does not double-prefix the mount path', async () => {
    const res = await request(mount()).get('/api/system/system/status');
    expect(res.status).toBe(404);
  });
});
