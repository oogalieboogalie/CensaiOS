// Docker reads are owner only, like Docker changes: a container list, its
// details and above all its logs can carry addresses and tokens. Each case
// runs the REAL /api/docker guards from ROUTE_MOUNTS in front of the real
// Docker router, with a fake Docker engine behind it.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeDocker } from './fixtures/dockerFake.js';

const fake = createFakeDocker();
jest.unstable_mockModule('../server/runner/client.js', () => ({
  runnerClient: { exec: jest.fn((command, args) => Promise.resolve(fake.exec(command, args))) },
}));

const { onLogRecord } = await import('../server/logger.js');
const { default: pool } = await import('../server/db.js');
const { ROUTE_MOUNTS } = await import('../server/boot/routeMap.js');
const { dockerRouteLabel } = await import('../server/docker/ownerOnly.js');
const { devServersRouter } = await import('../server/routes/devServers.js');
const { containersRouter } = await import('../server/routes/containers.js');

// Pretend people, never real ones: Pat owns this computer; Mo is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const PAT = 1;
const MO = 2;

const logged = [];
onLogRecord(({ namespace, level, message }) => logged.push([namespace, level, message]));

beforeAll(() => {
  pool.query = jest.fn(async (_sql, [id]) => ({ rows: ROLES[id] ? [{ role: ROLES[id] }] : [] }));
});
beforeEach(() => { logged.length = 0; });

function appAs(userId, mountPath = '/api/docker') {
  const entry = ROUTE_MOUNTS.find((e) => e.path === mountPath);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId }; next(); });
  app.use(mountPath, ...(entry.middleware || []), entry.router);
  return app;
}

const READS = ['/status', '/containers', '/stats', '/containers/homebase-app-1',
  '/containers/homebase-app-1/logs?tail=20', '/images', '/images/history?ref=homebase:latest', '/volumes', '/networks', '/compose'];

describe('Docker reads', () => {
  test.each(READS)('a teammate is refused GET %s with the owner-only reason', async (path) => {
    const res = await request(appAs(MO)).get(`/api/docker${path}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ reason: 'owner-only', code: 'computer_owner_only' });
    expect(JSON.stringify(res.body)).not.toMatch(/homebase-app-1|lines/);
  });

  test.each(READS)('the owner may GET %s', async (path) => {
    expect((await request(appAs(PAT)).get(`/api/docker${path}`)).status).toBe(200);
  });

  test('someone signed out is refused', async () => {
    expect((await request(appAs(undefined)).get('/api/docker/containers')).status).toBe(401);
  });

  test('changes stay refused for a teammate', async () => {
    expect((await request(appAs(MO)).post('/api/docker/containers/homebase-redis-1/stop')).status).toBe(403);
  });
});

describe("the 'docker' log line", () => {
  test('names the account number and the kind of route, never the container', async () => {
    await request(appAs(MO)).get('/api/docker/containers/homebase-app-1/logs?tail=20');
    const lines = logged.filter(([name]) => name === 'docker').map(([, , msg]) => msg);
    expect(lines).toEqual(['refused read /containers/:id/logs for account 2: not the owner']);
  });

  test('nothing is logged for the owner', async () => {
    await request(appAs(PAT)).get('/api/docker/containers');
    expect(logged.filter(([name]) => name === 'docker')).toEqual([]);
  });

  test("reading an image's layers names neither the image nor a step's command", async () => {
    const res = await request(appAs(PAT)).get('/api/docker/images/history?ref=homebase:latest');
    expect(res.body.layers.map((l) => l.step)).toContain('ENV MADE_UP_TOKEN=made-up-secret-value');
    const lines = logged.filter(([name]) => name === 'docker');
    expect(lines.map(([, , msg]) => msg)).toEqual(["read an image's layers"]);
    expect(JSON.stringify(logged)).not.toMatch(/made-up-secret-value|MADE_UP_TOKEN|npm ci|homebase/);
  });

  test('route labels keep only known words', () => {
    expect(dockerRouteLabel('/containers/my-secret-db/stop')).toBe('/containers/:id/:id');
    expect(dockerRouteLabel('/images?ref=x')).toBe('/images');
    expect(dockerRouteLabel('/images/history?ref=x')).toBe('/images/history');
  });
});

describe('no side doors into container logs', () => {
  function devApp(userId) {
    const app = express();
    app.use((req, _res, next) => { req.session = { userId }; next(); });
    app.use('/api/dev-servers', devServersRouter);
    return app;
  }

  test("Run dev's log route refuses a teammate", async () => {
    expect((await request(devApp(MO)).get('/api/dev-servers/homebase-app-1/logs')).status).toBe(403);
  });

  test("Run dev's log route reads only Run dev containers, even for the owner", async () => {
    expect((await request(devApp(PAT)).get('/api/dev-servers/homebase-app-1/logs')).status).toBe(400);
  });

  test.each(['/api/containers', '/api/containers/homebase-app-1/logs'])('the older GET %s refuses a teammate', async (url) => {
    const app = express();
    app.use((req, _res, next) => { req.session = { userId: MO }; next(); });
    app.use('/api', containersRouter);
    expect((await request(app).get(url)).status).toBe(403);
  });
});
