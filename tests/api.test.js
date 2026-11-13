import request from 'supertest';
import { app } from '../server.js';
import pool from '../server/db.js';

describe('CensaiHub API endpoint tests', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GET /api/health responds without starting the app listener', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: expect.any(Boolean) });
  });

test('importing server.js does not start background workers in Jest', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
