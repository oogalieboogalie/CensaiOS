import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The runner runs as the image's normal user, not root, and says so plainly
// when that user can't reach Docker. The app service keeps its own user.

const logged = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => {
    const line = (level) => (msg, meta) => logged.push([level, msg, meta]);
    return { info: line('info'), warn: line('warn'), error: line('error'), debug: line('debug') };
  },
}));
const { dockerSocketCheck } = await import('../server/runner/service.js');
const { classifyFailure } = await import('../server/docker/cli.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');

function serviceBlock(name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\n[a-z]/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('docker-compose.yml', () => {
  test('the runner runs as a normal user with the socket group added', () => {
    const runner = serviceBlock('runner');
    expect(runner).toMatch(/^ {4}user: \$\{CENSAI_RUNNER_USER:-node\}$/m);
    expect(runner).toMatch(/group_add:\n\s+- "\$\{CENSAI_DOCKER_GID:-0\}"/);
    expect(runner).toContain('/var/run/docker.sock:/var/run/docker.sock');
  });

  test('the app service keeps its own user', () => {
    const app = serviceBlock('homebase');
    expect(app).toContain('RUNNER_URL: http://runner:3003');
    expect(app).not.toMatch(/^ {4}user:/m);
    expect(app).not.toMatch(/group_add/);
  });

  test('the image makes the secret folder the normal user can write', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/chown node:node \/run\/censai-runner/);
  });
});

describe('when the runner cannot reach Docker', () => {
  beforeEach(() => { logged.length = 0; });

  test('the start-up line says the socket is reachable, with the user number only', async () => {
    expect(await dockerSocketCheck(async () => '27.3.1', 1000)).toBe(true);
    expect(logged).toEqual([['info', 'docker socket reachable', { uid: 1000 }]]);
  });

  test('a refused socket gets its own start-up line', async () => {
    const refused = async () => { throw new Error('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock'); };
    expect(await dockerSocketCheck(refused, 1000)).toBe(false);
    expect(logged).toEqual([['warn', 'docker socket not reachable as a normal user', { uid: 1000 }]]);
  });

  test('the Docker window gets a plain sentence instead of the raw error', () => {
    const raw = 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/info": dial unix /var/run/docker.sock: connect: permission denied';
    expect(classifyFailure(raw)).toEqual({
      reason: 'no-socket-access',
      message: "The runner can't reach Docker as a normal user. See the Docker help page.",
    });
    expect(classifyFailure('Cannot connect to the Docker daemon at unix:///var/run/docker.sock')).toMatchObject({ reason: 'daemon-down' });
  });
});
