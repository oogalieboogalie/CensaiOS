// The Sovereign Test window's route reads and adds rows in the shared agents
// table. It runs the REAL /api/sovereignTest guards from ROUTE_MOUNTS: a
// hosted (cloud) copy refuses it outright, and only the owner may add.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const { default: pool } = await import('../server/db.js');
const { ROUTE_MOUNTS } = await import('../server/boot/routeMap.js');

// Pretend people: Pat owns this computer; Mo is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const PAT = 1;
const MO = 2;

const inserts = [];
beforeAll(() => {
  pool.query = jest.fn(async (sql, params = []) => {
    if (/INSERT INTO agents/.test(sql)) {
      inserts.push(params);
      return { rows: [{ id: params[0], name: params[1] }] };
    }
    if (/FROM agents/.test(sql)) return { rows: [{ id: 'a1', name: 'Atlas' }] };
    return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
  });
});

const savedMode = process.env.HOMEBASE_MODE;
afterEach(() => {
  if (savedMode === undefined) delete process.env.HOMEBASE_MODE;
  else process.env.HOMEBASE_MODE = savedMode;
  inserts.length = 0;
});

function appAs(userId) {
  const entry = ROUTE_MOUNTS.find((e) => e.path === '/api/sovereignTest');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId }; next(); });
  app.use(entry.path, ...(entry.middleware || []), entry.router);
  return app;
}

describe('/api/sovereignTest', () => {
  test('is guarded in the route map', () => {
    const entry = ROUTE_MOUNTS.find((e) => e.path === '/api/sovereignTest');
    expect(entry.middleware?.length).toBe(2);
  });

  test('a hosted (cloud) copy refuses reads and writes for everyone', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';
    expect((await request(appAs(PAT)).get('/api/sovereignTest')).status).toBe(403);
    expect((await request(appAs(MO)).post('/api/sovereignTest').send({ name: 'x' })).status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test('on the desktop a teammate may look but not add', async () => {
    process.env.HOMEBASE_MODE = 'local_desktop';
    expect((await request(appAs(MO)).get('/api/sovereignTest')).status).toBe(200);
    expect((await request(appAs(MO)).post('/api/sovereignTest').send({ name: 'x' })).status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test('on the desktop the owner may add', async () => {
    process.env.HOMEBASE_MODE = 'local_desktop';
    const res = await request(appAs(PAT)).post('/api/sovereignTest').send({ name: 'Scout' });
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
  });
});
