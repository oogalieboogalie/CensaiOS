import { jest } from '@jest/globals';
import request from 'supertest';
import { dockerOnlyViolation, execTarget, inspectViolation, badMountSource } from '../server/runner/dockerOnly.js';
import { createRunnerApp, resolveRunnerSecret } from '../server/runner/service.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SECRET = 'runner-test-secret-that-is-at-least-32-characters';

describe('docker-only runner: what it lets through', () => {
  test('the calls the Docker window and Run dev make are allowed', () => {
    for (const args of [
      ['ps', '-a', '--format', 'json'], ['info', '--format', '{{json .}}'], ['system', 'df', '-v'],
      ['logs', '--timestamps', '--tail=300', 'web'], ['rm', '-f', 'censai-dev-shop-0123456789'],
      ['exec', '-e', 'COLUMNS=80', 'web', 'sh', '-c', 'ls'], ['compose', '-p', 'shop', 'restart'],
      ['run', '-d', '--name', 'censai-dev-shop-1', '--mount', 'type=bind,source=/run/desktop/mnt/host/d/Sites/shop,target=/app',
        '--mount', 'type=volume,source=censai-dev-packages-1,target=/app/node_modules', '-p', '127.0.0.1::3000', 'node:22-bookworm-slim'],
      ['run', '--rm', '-v', 'D:\\Projects\\leadhound:/workspace', '--network', 'none', 'homebase-sandbox:node22'],
    ]) expect(dockerOnlyViolation('docker', args)).toBeNull();
  });

  test.each([
    [['run', '--privileged', 'alpine'], /--privileged/],
    [['run', '--pid=host', 'alpine'], /--pid/],
    [['run', '--network', 'host', 'alpine'], /host/],
    [['run', '-v', '/var/run/docker.sock:/var/run/docker.sock', 'docker'], /Docker socket/],
    [['run', '--mount', 'type=bind,source=/,target=/host', 'alpine'], /whole drive/],
    [['run', '-v', 'C:\\:/c', 'alpine'], /whole drive/],
    [['run', '--mount', 'type=bind,src=/run/desktop/mnt/host/c,target=/c', 'alpine'], /whole drive/],
    [['run', '-v', '/etc:/etc2', 'alpine'], /system folder/],
    [['run', '--volumes-from', 'runner', 'alpine'], /--volumes-from/],
    [['cp', 'x:/a', '/b'], /not allowed/],
    [['compose', '-p', 'shop', 'up', '-d'], /compose up/],
  ])('refuses %j', (args, why) => {
    expect(dockerOnlyViolation('docker', args)).toMatch(why);
  });

  test('anything that is not docker is refused', () => {
    expect(dockerOnlyViolation('sh', ['-c', 'rm -rf /'])).toMatch(/only docker/);
    expect(dockerOnlyViolation('git', ['status'])).toMatch(/only docker/);
  });

  test('exec into a container that holds the socket or runs privileged is refused', () => {
    expect(execTarget(['exec', '-e', 'A=1', '-u', 'root', 'web', 'sh'])).toBe('web');
    expect(inspectViolation(JSON.stringify([{ HostConfig: {}, Mounts: [{ Source: '/var/run/docker.sock' }] }]))).toMatch(/Docker socket/);
    expect(inspectViolation(JSON.stringify([{ HostConfig: { Privileged: true }, Mounts: [] }]))).toMatch(/privileged/);
    expect(inspectViolation(JSON.stringify([{ HostConfig: {}, Mounts: [{ Source: '/run/desktop/mnt/host/d/Sites/shop' }] }]))).toBeNull();
    expect(badMountSource('censai-dev-packages-1')).toBeNull();
    // A Run dev container: its package volume lives under /var/lib/docker, which is fine.
    expect(inspectViolation(JSON.stringify([{ HostConfig: {}, Mounts: [
      { Type: 'bind', Source: '/run/desktop/mnt/host/d/Sites/shop' },
      { Type: 'volume', Source: '/var/lib/docker/volumes/censai-dev-packages-1/_data' },
    ] }]))).toBeNull();
  });
});

describe('docker-only runner service', () => {
  test('refuses before running anything, and file access is off', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createRunnerApp({ runnerSecret: SECRET, dockerOnly: true });
    const res = await request(app).post('/exec').set('x-runner-secret', SECRET)
      .send({ command: 'sh', args: ['-c', 'echo pwned'], options: { shell: true } }).expect(200);
    expect(res.body).toMatchObject({ code: 126, stdout: '' });
    expect(res.body.stderr).toMatch(/Refused by the Docker gatekeeper/);
    await request(app).post('/fs/read').set('x-runner-secret', SECRET).send({ path: '/etc/passwd' }).expect(403);
    warn.mockRestore();
  });

  test('makes its secret once and reuses it', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runner-')), 'secret');
    const first = resolveRunnerSecret({ RUNNER_SECRET_FILE: file });
    expect(first).toHaveLength(64);
    expect(resolveRunnerSecret({ RUNNER_SECRET_FILE: file })).toBe(first);
    expect(resolveRunnerSecret({ RUNNER_SECRET: SECRET, RUNNER_SECRET_FILE: file })).toBe(SECRET);
  });
});
