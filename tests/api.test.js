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
    expect(response.body).toEqual(expect.objectContaining({
      provider: expect.any(String),
      model: expect.any(String),
      database: expect.any(Boolean),
      taskWorker: expect.any(Object),
      schedulerWorker: expect.any(Object),
      agentCardWorker: expect.any(Object),
      agentWakeupWorker: expect.any(Object),
    }));
    expect(response.body.databaseStatus).toEqual(expect.objectContaining({
      ready: expect.any(Boolean),
      degraded: expect.any(Boolean),
    }));
  });

test('importing server.js does not start background workers in Jest', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
