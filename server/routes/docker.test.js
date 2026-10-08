import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createFakeDocker } from '../../tests/fixtures/dockerFake.js';

let fake = createFakeDocker();
jest.unstable_mockModule('../runner/client.js', () => ({
  runnerClient: { exec: jest.fn((command, args) => Promise.resolve(fake.exec(command, args))) },
}));

const { dockerRouter } = await import('./docker.js');
const app = express();
app.use(express.json());
app.use('/api/docker', dockerRouter);

beforeEach(() => { fake = createFakeDocker(); });

describe('/api/docker', () => {
  test('GET /status returns engine info', async () => {
    const res = await request(app).get('/api/docker/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, engine: { version: '27.3.1' } });
  });

  test('GET /status explains a stopped daemon with 200, lists return 503', async () => {
    fake = createFakeDocker({ daemon: 'down' });
    const status = await request(app).get('/api/docker/status');
    expect(status.body).toMatchObject({ available: false, reason: 'daemon-down' });
    const list = await request(app).get('/api/docker/containers');
    expect(list.status).toBe(503);
    expect(list.body.reason).toBe('daemon-down');
  });

  test('lists every resource kind', async () => {
    for (const [path, key] of [['containers', 'containers'], ['stats', 'stats'], ['images', 'images'], ['volumes', 'volumes'], ['networks', 'networks'], ['compose', 'projects']]) {
      const res = await request(app).get(`/api/docker/${path}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body[key])).toBe(true);
      expect(res.body[key].length).toBeGreaterThan(0);
    }
  });

  test('container detail, logs, actions and exec', async () => {
    expect((await request(app).get('/api/docker/containers/homebase-app-1')).body.name).toBe('homebase-app-1');
    expect((await request(app).get('/api/docker/containers/homebase-app-1/logs?tail=20')).body.lines).toHaveLength(10);
    expect((await request(app).post('/api/docker/containers/homebase-redis-1/stop')).body).toMatchObject({ ok: true, action: 'stop' });
    const exec = await request(app).post('/api/docker/containers/homebase-app-1/exec').send({ command: 'ls' });
    expect(exec.body).toMatchObject({ ok: true, exitCode: 0 });
    expect((await request(app).delete('/api/docker/containers/ollama?force=true')).status).toBe(200);
  });

  test('bad input is a 400, Docker errors are a 500 with Docker\'s message', async () => {
    expect((await request(app).post('/api/docker/containers/ollama/commit')).status).toBe(400);
    expect((await request(app).get('/api/docker/containers/-x/logs')).status).toBe(400);
    const res = await request(app).delete('/api/docker/volumes/homebase_pgdata');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/volume is in use/);
  });

  test('image refs with slashes are removed via the query string', async () => {
    const res = await request(app).delete('/api/docker/images').query({ ref: 'qdrant/qdrant:v1.11.0' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 'qdrant/qdrant:v1.11.0' });
  });
});
