import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createFakeDocker } from '../../tests/fixtures/dockerFake.js';

let fake = createFakeDocker();
const calls = [];
jest.unstable_mockModule('../runner/client.js', () => ({
  runnerClient: { exec: jest.fn((command, args) => { calls.push(args); return Promise.resolve(fake.exec(command, args)); }) },
}));
const logged = [];
jest.unstable_mockModule('../logger.js', () => ({
  createLogger: () => ({ info: (m) => logged.push(['info', m]), warn: (m) => logged.push(['warn', m]) }),
}));

const { parsePorts } = await import('./run.js');
const { parseEnv, parseShare, parseRestart } = await import('./runOptions.js');
const { dockerRouter } = await import('../routes/docker.js');
const app = express();
app.use(express.json());
app.use('/api/docker', dockerRouter);

beforeEach(() => { fake = createFakeDocker(); calls.length = 0; logged.length = 0; });

describe('Run a new container from an image', () => {
  test('starts the container with its name and ports, and it shows in the list', async () => {
    const res = await request(app).post('/api/docker/images/run').send({ image: 'axllent/mailpit:latest', name: 'mail-test', ports: '8025:8025, 1025' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, name: 'mail-test', ports: ['8025:8025', '1025:1025'] });
    expect(calls.at(-1)).toEqual(['run', '-d', '--name', 'mail-test', '-p', '127.0.0.1:8025:8025', '-p', '127.0.0.1:1025:1025', 'axllent/mailpit:latest']);
    const list = await request(app).get('/api/docker/containers');
    const made = list.body.containers.find((c) => c.name === 'mail-test');
    expect(made).toMatchObject({ state: 'running', image: 'axllent/mailpit:latest' });
    expect(logged).toEqual([['info', expect.stringMatching(/^run: started a container, ports 8025:8025, 1025:1025, 0 settings, shared folder no, restart no \(\w+\)$/)]]);
    // Neither the image nor the container's name: either can carry a project folder's name.
    expect(JSON.stringify(logged)).not.toMatch(/mailpit|mail-test/);
  });

  test('a name already in use is Docker\'s own message, and the log says why', async () => {
    const res = await request(app).post('/api/docker/images/run').send({ image: 'redis:7', name: 'ollama' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/already in use/);
    expect(logged[0][0]).toBe('warn');
    expect(logged[0][1]).toMatch(/^run: could not start a container, .*: name taken$/);
    expect(logged[0][1]).not.toMatch(/redis|ollama/);
  });

  test('nothing typed can become a docker flag', async () => {
    for (const body of [{ image: '--privileged' }, { image: 'redis:7', name: '--rm' }, { image: 'redis:7', ports: '-v/:/host' }, { image: 'redis:7', ports: '80:80:80' }]) {
      const res = await request(app).post('/api/docker/images/run').send(body);
      expect(res.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  test('ports read as computer:container, one number means the same on both', () => {
    expect(parsePorts('8080:80 3000')).toEqual(['8080:80', '3000:3000']);
    expect(parsePorts('')).toEqual([]);
    expect(() => parsePorts('70000')).toThrow(/port number/);
    expect(() => parsePorts(Array(11).fill('80'))).toThrow(/at most 10/);
  });

  test('settings, a shared folder and restart reach Docker and show on the info page; the log keeps values out', async () => {
    const res = await request(app).post('/api/docker/images/run').send({
      image: 'redis:7', name: 'notes-db', ports: '6380:6379',
      env: 'REDIS_PASSWORD=fake-pw\nAPP_MODE=test\n',
      share: { host: 'D:\\data\\notes', target: '/data' }, restart: 'unless-stopped',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ settings: 2, shared: true, restart: 'unless-stopped' });
    expect(calls.at(-1)).toEqual(['run', '-d', '--name', 'notes-db', '-p', '127.0.0.1:6380:6379',
      '-e', 'REDIS_PASSWORD=fake-pw', '-e', 'APP_MODE=test',
      '--mount', 'type=bind,source=D:\\data\\notes,target=/data', '--restart', 'unless-stopped', 'redis:7']);
    const made = (await request(app).get('/api/docker/containers')).body.containers.find((c) => c.name === 'notes-db');
    const info = (await request(app).get(`/api/docker/containers/${made.id}`)).body;
    expect(info.restartPolicy).toBe('unless-stopped');
    expect(info.mounts).toEqual([expect.objectContaining({ type: 'bind', source: 'D:\\data\\notes', destination: '/data' })]);
    expect(info.env.map((e) => e.key)).toEqual(['REDIS_PASSWORD', 'APP_MODE']);
    expect(info.env[0].masked).toBe(true);
    expect(logged).toEqual([['info', expect.stringMatching(/^run: started a container, ports 6380:6379, 2 settings, shared folder yes, restart unless-stopped/)]]);
    expect(JSON.stringify(logged)).not.toMatch(/fake-pw|REDIS_PASSWORD|APP_MODE|D:|\/data|redis|notes-db/);
  });

  test('bad settings, folders and restart choices are refused before Docker runs', async () => {
    for (const body of [
      { image: 'redis:7', env: '-v=/:/host' }, { image: 'redis:7', env: 'NO_EQUALS' }, { image: 'redis:7', env: 'A=1\nA=2' },
      { image: 'redis:7', share: { host: 'C:\\', target: '/host' } }, { image: 'redis:7', share: { host: '/var/run/docker.sock', target: '/sock' } },
      { image: 'redis:7', share: { host: 'data', target: '/data' } }, { image: 'redis:7', share: { host: '/srv/a,b', target: '/data' } },
      { image: 'redis:7', share: { host: '/srv/data', target: '' } }, { image: 'redis:7', restart: '--privileged' },
    ]) {
      const res = await request(app).post('/api/docker/images/run').send(body);
      expect(res.status).toBe(400);
    }
    expect(calls).toEqual([]);
    expect(JSON.stringify(logged)).not.toMatch(/docker\.sock|\/srv/);
  });

  test('setting lines skip blanks and # notes; restart defaults to no', () => {
    expect(parseEnv('A=1\n\n# note\nB=x=y')).toEqual([['A', '1'], ['B', 'x=y']]);
    expect(parseShare({ host: '', target: '' })).toBeNull();
    expect(parseShare({ host: '/home/sam/data', target: '/data', readOnly: true })).toEqual({ host: '/home/sam/data', target: '/data', readOnly: true });
    expect(parseRestart(undefined)).toBe('no');
  });

  test('setting values drop spaces around the = and refuse line breaks or hidden characters', () => {
    expect(parseEnv('POSTGRES_PASSWORD = s3cret')).toEqual([['POSTGRES_PASSWORD', 's3cret']]);
    expect(() => parseEnv(['TOKEN=abc\u0000'])).toThrow(/hidden character/);
    expect(() => parseEnv(['NOTE=one\ntwo'])).toThrow(/line break/);
  });
});
