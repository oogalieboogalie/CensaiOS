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
    expect(calls.at(-1)).toEqual(['run', '-d', '--name', 'mail-test', '-p', '8025:8025', '-p', '1025:1025', 'axllent/mailpit:latest']);
    const list = await request(app).get('/api/docker/containers');
    const made = list.body.containers.find((c) => c.name === 'mail-test');
    expect(made).toMatchObject({ state: 'running', image: 'axllent/mailpit:latest' });
    expect(logged).toEqual([['info', expect.stringMatching(/run: started axllent\/mailpit:latest as mail-test, ports 8025:8025, 1025:1025/)]]);
  });

  test('a name already in use is Docker\'s own message, and the log says why', async () => {
    const res = await request(app).post('/api/docker/images/run').send({ image: 'redis:7', name: 'ollama' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/already in use/);
    expect(logged[0][0]).toBe('warn');
    expect(logged[0][1]).toMatch(/could not start redis:7 as ollama.*already in use/);
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
});
