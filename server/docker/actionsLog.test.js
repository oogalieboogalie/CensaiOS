import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createFakeDocker } from '../../tests/fixtures/dockerFake.js';

// Every Docker button leaves one 'docker' log line: what was done to which
// kind of thing, and whether it worked or why not. Never a typed command or
// its output, and never a name: containers, images, volumes, networks and
// compose projects are often named after a project's folder.
let fake = createFakeDocker();
jest.unstable_mockModule('../runner/client.js', () => ({
  runnerClient: { exec: jest.fn((command, args) => Promise.resolve(fake.exec(command, args))) },
}));
const logged = [];
jest.unstable_mockModule('../logger.js', () => ({
  createLogger: (name) => ({ info: (m) => logged.push([name, 'info', m]), warn: (m) => logged.push([name, 'warn', m]) }),
}));

const { dockerRouter } = await import('../routes/docker.js');
const app = express();
app.use(express.json());
app.use('/api/docker', dockerRouter);

beforeEach(() => { fake = createFakeDocker(); logged.length = 0; });

const press = {
  stop: () => request(app).post('/api/docker/containers/automation-n8n-1/stop'),
  start: () => request(app).post('/api/docker/containers/automation-n8n-1/start'),
  restart: () => request(app).post('/api/docker/containers/automation-n8n-1/restart'),
  shell: () => request(app).post('/api/docker/containers/automation-n8n-1/exec').send({ command: 'echo pat-secret-value' }),
  remove: () => request(app).delete('/api/docker/containers/automation-n8n-1?force=1'),
  pull: () => request(app).post('/api/docker/images/pull').send({ ref: 'redis:7' }),
  removeImage: () => request(app).delete('/api/docker/images?ref=redis:7'),
  prune: () => request(app).post('/api/docker/prune/images'),
  removeVolume: () => request(app).delete('/api/docker/volumes/sam_cache'),
  removeNetwork: () => request(app).delete('/api/docker/networks/legacy_backend'),
  composeDown: () => request(app).post('/api/docker/compose/automation/down'),
  composeUp: () => request(app).post('/api/docker/compose/automation/up'),
};

describe('Docker action log lines', () => {
  test('each button once leaves exactly one line', async () => {
    for (const [name, go] of Object.entries(press)) {
      const before = logged.length;
      const res = await go();
      expect([name, res.status]).toEqual([name, 200]);
      expect([name, logged.length - before]).toEqual([name, 1]);
    }
    expect(logged.every(([name]) => name === 'docker')).toBe(true);
    expect(logged.map(([, level, line]) => `${level} ${line}`)).toEqual([
      'info stop container: done',
      'info start container: done',
      'info restart container: done',
      'info shell command in container: done (exit 0)',
      'info remove container: done (forced)',
      'info pull image: done',
      'info remove image: done',
      'info clean up unused images: done (freed 1.19GB)',
      'info remove volume: done',
      'info remove network: done',
      'info compose down: done',
      'info compose up: done',
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/automation|n8n|redis|sam_cache|legacy_backend/);
  });

  test('a failure says why, and a typed command never reaches the log', async () => {
    const inUse = await request(app).delete('/api/docker/volumes/homebase_pgdata');
    expect(inUse.status).toBe(500);
    expect(logged.at(-1)).toEqual(['docker', 'warn', 'remove volume: failed (still in use)']);
    await request(app).post('/api/docker/containers/automation-n8n-1/exec').send({ command: 'exit 3' });
    await request(app).post('/api/docker/containers/automation-n8n-1/exec').send({ command: 'echo TOKEN=jordan-demo-token' });
    expect(logged.at(-2)).toEqual(['docker', 'info', 'shell command in container: done (exit 1)']);
    expect(JSON.stringify(logged)).not.toMatch(/jordan-demo-token|pat-secret-value|TOKEN/);
  });

  test('a container pressed by its id is not named either; a Run dev container keeps its folder\'s hash', async () => {
    await request(app).post('/api/docker/images/run').send({ image: 'redis:7', name: 'censai-dev-made-up-shop-0123456789' });
    const list = (await request(app).get('/api/docker/containers')).body.containers;
    const [ollama, runDev] = ['ollama', 'censai-dev-made-up-shop-0123456789'].map((name) => list.find((c) => c.name === name).id);
    expect(ollama).toMatch(/^[0-9a-f]{12,}$/);
    await request(app).post(`/api/docker/containers/${ollama}/restart`);
    await request(app).delete(`/api/docker/containers/${ollama}?force=1`);
    await request(app).post(`/api/docker/containers/${runDev}/stop`);
    expect(logged.slice(-3).map(([, , line]) => line)).toEqual([
      'restart container: done', 'remove container: done (forced)', 'stop container censai-dev-[redacted]-0123456789: done',
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/ollama|made-up-shop/);
  });

  test('an unknown action is refused and logged without echoing it', async () => {
    const res = await request(app).post('/api/docker/containers/automation-n8n-1/explode');
    expect(res.status).toBe(400);
    expect(logged.at(-1)[2]).toBe('unknown action on container: failed (refused before Docker ran)');
  });
});
