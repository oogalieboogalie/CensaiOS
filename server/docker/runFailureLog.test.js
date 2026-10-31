import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Docker's "could not start" log line carries a fixed reason, never Docker's
// own words, which can repeat a setting or a folder from the Run settings.
// The person still gets Docker's full message in the window. Made-up names.
let answer = null;
jest.unstable_mockModule('../runner/client.js', () => ({
  runnerClient: { exec: jest.fn(async () => answer) },
}));
const logged = [];
jest.unstable_mockModule('../logger.js', () => ({
  createLogger: () => ({ info: (m) => logged.push(['info', m]), warn: (m) => logged.push(['warn', m]), error: (m) => logged.push(['error', m]) }),
}));

const { dockerRouter } = await import('../routes/docker.js');
const { dockerFailureReason } = await import('./failureReason.js');
const { DockerInputError, DockerUnavailableError } = await import('./cli.js');
const app = express();
app.use(express.json());
app.use('/api/docker', dockerRouter);

const SECRET_BITS = /secret-plans|PAT_TOKEN|hunter2/;
const failWith = (stderr) => { answer = { code: 125, stdout: '', stderr }; };

beforeEach(() => { logged.length = 0; answer = null; });

test('a failed run that names a folder and a setting leaves neither in the log', async () => {
  failWith('docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /home/pat/secret-plans (env PAT_TOKEN=hunter2).');
  const res = await request(app).post('/api/docker/images/run')
    .send({ image: 'redis:7', name: 'pat-cache', env: 'PAT_TOKEN=hunter2', share: '/home/pat/secret-plans:/data' });
  expect(res.status).toBe(500);
  expect(res.body.error).toMatch(/secret-plans/);
  expect(logged).toHaveLength(1);
  expect(logged[0][0]).toBe('warn');
  expect(logged[0][1]).toMatch(/^run: could not start a container, .*: other$/);
  expect(logged[0][1]).not.toMatch(/redis|pat-cache/);
  expect(logged[0][1]).not.toMatch(SECRET_BITS);
});

test.each([
  ['image not found', 'Unable to find image \'pat/secret-plans:latest\' locally\npull access denied for pat/secret-plans'],
  ['port in use', 'driver failed programming external connectivity: Bind for 0.0.0.0:8080 failed: port is already allocated'],
  ['name taken', 'Conflict. The container name "/pat-cache" is already in use by container "abc123"'],
  ['Docker not running', 'error during connect: open //./pipe/docker_engine: The system cannot find the file specified.'],
  ['other', 'invalid env PAT_TOKEN=hunter2 for /home/pat/secret-plans'],
])('%s', async (reason, stderr) => {
  failWith(stderr);
  await request(app).post('/api/docker/images/run').send({ image: 'redis:7', name: 'pat-cache' });
  expect(logged.at(-1)[1]).toMatch(new RegExp(`: ${reason}$`));
  expect(logged.at(-1)[1]).not.toMatch(SECRET_BITS);
});

test('settings refused before Docker runs, and no Docker at all, have their own reasons', () => {
  expect(dockerFailureReason(new DockerInputError('"PAT_TOKEN" is not a valid setting'))).toBe('refused before Docker ran');
  expect(dockerFailureReason(new DockerUnavailableError('Docker is not running.', 'daemon'))).toBe('Docker not running');
  expect(dockerFailureReason(null)).toBe('other');
});
