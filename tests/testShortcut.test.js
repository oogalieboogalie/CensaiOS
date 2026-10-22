import request from 'supertest';
import { app } from '../server.js';
import { isJestRun } from '../server/security/testShortcut.js';

// The "everyone is user 1" shortcut runs only inside jest, never on a plain
// NODE_ENV=test setting.
describe('test-only shortcut', () => {
  test('counts only when NODE_ENV is test and jest is running', () => {
    expect(isJestRun({ NODE_ENV: 'test', JEST_WORKER_ID: '1' })).toBe(true);
    expect(isJestRun({ NODE_ENV: 'test' })).toBe(false);
    expect(isJestRun({ NODE_ENV: 'production', JEST_WORKER_ID: '1' })).toBe(false);
    expect(isJestRun({})).toBe(false);
  });

  describe('the /api sign-in guard', () => {
    const worker = process.env.JEST_WORKER_ID;
    afterEach(() => { process.env.JEST_WORKER_ID = worker; });

    test('inside jest a request without a sign-in passes as user 1', async () => {
      const res = await request(app).get('/api/made-up-route-for-pat');
      expect(res.status).not.toBe(401);
    });

    test('NODE_ENV=test outside jest is refused as signed out', async () => {
      delete process.env.JEST_WORKER_ID;
      const res = await request(app).get('/api/made-up-route-for-pat');
      expect(res.status).toBe(401);
    });
  });
});
