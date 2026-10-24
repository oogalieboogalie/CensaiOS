import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const logged = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => {
    const line = (level) => (msg, meta) => logged.push([level, msg, meta]);
    return { info: line('info'), warn: line('warn'), error: line('error'), debug: line('debug') };
  },
}));
const { dockerOnlyViolation, execTarget, inspectViolation, badMountSource, withRunnerDefaults } = await import('../server/runner/dockerOnly.js');
const { canonicalHostPath } = await import('../server/runner/dockerMounts.js');
const { discoverStack, gateRefusal } = await import('../server/runner/dockerStack.js');
const { createRunnerApp, resolveRunnerSecret, childOptions } = await import('../server/runner/service.js');

const SECRET = 'runner-test-secret-that-is-at-least-32-characters';

// The stack as the runner sees it on a Windows PC: projects in D:\Projects
// and D:\Sites, censaiOS itself in D:\Apps\CensaiHub.
const FACTS = {
  project: 'censaihub',
  projectsRoots: ['D:\\Projects', '/run/desktop/mnt/host/d/Sites'].map((r) => canonicalHostPath(r)),
  blockedFolders: [canonicalHostPath('D:\\Apps\\CensaiHub')],
  cwd: '/app',
  containers: new Set(['censaihub-postgres-1']),
  volumes: new Set(['censaihub_pgdata18root']),
  networks: new Set(['censaihub_default']),
  images: new Set(['censaihub-homebase', 'postgres:18']),
};
const refused = (args, facts = FACTS) => dockerOnlyViolation('docker', args, facts);

// Fake `docker inspect` answers for the target checks.
const CONTAINERS = {
  postgres: { Id: 'aaa', Name: '/censaihub-postgres-1', Config: { Labels: { 'com.docker.compose.project': 'censaihub' } }, HostConfig: {}, Mounts: [{ Type: 'volume', Name: 'censaihub_pgdata18root' }] },
  homebase: { Id: 'bbb', Name: '/censaihub-homebase-1', Config: { Labels: { 'com.docker.compose.project': 'censaihub' } }, HostConfig: {}, Mounts: [{ Type: 'volume', Name: 'censaihub_runner_secret' }] },
  stray: { Id: 'ccc', Name: '/stray', Config: { Labels: {} }, HostConfig: {}, Mounts: [] },
  sandbox: { Id: 'ddd', Name: '/homebase-sbx-1', Config: { Labels: { 'homebase.sandbox': '1' } }, HostConfig: {}, Mounts: [{ Type: 'bind', Source: '/run/desktop/mnt/host/d/projects/shop' }] },
  made: { Id: 'eee', Name: '/made', Config: { Labels: { 'censai.runner': '1' } }, HostConfig: {}, Mounts: [] },
  oldMount: { Id: 'fff', Name: '/old', Config: { Labels: { 'censai.runner': '1' } }, HostConfig: {}, Mounts: [{ Type: 'bind', Source: '/home/sam' }] },
};
const fakeRun = async (args) => {
  const c = CONTAINERS[args.at(-1)];
  if (!c) throw new Error('No such container');
  return JSON.stringify([c]);
};
const gate = (args, facts = FACTS) => gateRefusal('docker', args, facts, fakeRun);

describe('docker-only runner: what it lets through', () => {
  test('the calls the Docker window, Run dev and the sandbox make are allowed', async () => {
    for (const args of [
      ['ps', '-a', '--format', 'json'], ['info', '--format', '{{json .}}'], ['system', 'df', '-v'],
      ['logs', '--timestamps', '--tail=300', 'web'], ['compose', '-p', 'shop', 'restart'], ['compose', 'ls', '-a', '--format', 'json'],
      ['run', '-d', '--name', 'censai-dev-shop-1', '--mount', 'type=bind,source=/run/desktop/mnt/host/d/Sites/shop,target=/app',
        '--mount', 'type=volume,source=censai-dev-packages-1,target=/app/node_modules', '-p', '127.0.0.1::3000', 'node:22-bookworm-slim', 'node', '-e', 'x'],
      ['run', '--rm', '-v', 'D:\\Projects\\leadhound:/workspace', '--network', 'none', 'homebase-sandbox:node22'],
      ['run', '-d', '--name', 'notes-db', '-p', '127.0.0.1:6380:6379', '-e', 'A=1', '--restart', 'unless-stopped', 'redis:7'],
      ['volume', 'rm', 'censai-dev-packages-1'], ['image', 'inspect', 'redis:7'], ['pull', '--quiet', 'redis:7'],
    ]) expect(refused(args)).toBeNull();
    expect(await gate(['exec', '-e', 'COLUMNS=80', 'sandbox', 'sh', '-c', 'ls'])).toBeNull();
    expect(await gate(['rm', '-f', 'made'])).toBeNull();
    expect(await gate(['stop', '-t', '5', 'stray'])).toBeNull();
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
    [['exec', '--privileged', 'made', 'sh'], /--privileged/],
    [['-H', 'tcp://127.0.0.1:1', 'ps'], /--host/],
  ])('still refuses %j', (args, why) => {
    expect(refused(args)).toMatch(why);
  });

  test('anything that is not docker is refused', () => {
    expect(dockerOnlyViolation('sh', ['-c', 'rm -rf /'])).toMatch(/only docker/);
    expect(dockerOnlyViolation('git', ['status'])).toMatch(/only docker/);
  });
});

// One case per gap in the outside security review of 2026-10-21. Each was
// let through by the gate before this change.
describe('docker-only runner: the review gaps are closed', () => {
  test.each([
    ['A1 a home folder', ['run', '-v', '/home/user:/x', 'alpine'], /projects folder/],
    ['A1 a Windows user folder', ['run', '-v', 'C:\\Users\\sam:/x', 'alpine'], /projects folder/],
    ['A1 a bind outside the projects folder', ['run', '--mount', 'type=bind,source=/srv/data,target=/x', 'alpine'], /projects folder/],
    ['A1 censaiOS own folder inside a projects root', ['run', '-v', 'D:\\Apps:/x', 'alpine'], /projects folder|own folder/],
    ['A2 /tmp/../etc', ['run', '-v', '/tmp/../etc:/x', 'alpine'], /system folder/],
    ['A2 /..', ['run', '-v', '/..:/x', 'alpine'], /whole drive/],
    ['A2 /./', ['run', '-v', '/./:/x', 'alpine'], /whole drive/],
    ['A2 --mount source=/..', ['run', '--mount', 'source=/..,target=/x', 'alpine'], /not allowed/],
    ['A2 climbing out of the projects folder', ['run', '-v', 'D:\\Projects\\..\\Windows:/x', 'alpine'], /projects folder/],
    ['A2 a relative path', ['run', '-v', '../..:/x', 'alpine'], /projects folder|whole drive/],
    ['A2 a value glued to -v', ['run', '-v/etc:/x', 'alpine'], /system folder/],
    ['A2 -v inside a flag cluster', ['run', '-itv', '/home/user:/x', 'alpine'], /projects folder/],
    ['A3 the database volume', ['run', '-v', 'pgdata18root:/d', 'alpine'], /own data/],
    ['A3 the runner secret volume', ['run', '-v', 'censaihub_runner_secret:/s', 'alpine'], /own data/],
    ['A3 the app state volume by --mount', ['run', '--mount', 'type=volume,source=censaihub_homebase_state,target=/s', 'alpine'], /own data/],
    ['A3 a volume that binds the host', ['run', '--mount', 'type=volume,source=x,target=/x,volume-opt=device=/,volume-opt=o=bind', 'alpine'], /not allowed/],
    ['A3 making a volume that binds the host', ['volume', 'create', '-o', 'device=/', '-o', 'o=bind', 'x'], /driver options/],
    ['A4 compose run', ['compose', '-f', '/x/compose.yml', 'run', 'web'], /not allowed/],
    ['A4 compose config prints secrets', ['compose', '-p', 'censaihub', 'config'], /not allowed/],
    ['B2 --host before the command', ['--host=tcp://127.0.0.1:1', 'ps'], /--host/],
    ['B2 -H before the command', ['-Htcp://127.0.0.1:1', 'ps'], /--host/],
    ['B2 --context before the command', ['--context=other', 'ps'], /--host/],
    ['C1 system prune', ['system', 'prune', '-a', '--volumes'], /not allowed/],
    ['C1 volume prune', ['volume', 'prune', '-f'], /not allowed/],
    ['C1 removing the database volume', ['volume', 'rm', 'censaihub_pgdata18root'], /can't be removed/],
    ['C1 compose down on censaiOS', ['compose', '-p', 'censaihub', 'down', '-v'], /own containers/],
    ['C1 compose down with no project named', ['compose', 'down', '-v'], /-p/],
    ['C2 a port open to the Wi-Fi', ['run', '-p', '0.0.0.0:8080:80', 'nginx'], /127\.0\.0\.1/],
    ['C2 a port with no address', ['run', '-p', '8080:80', 'nginx'], /127\.0\.0\.1/],
    ['C2 -P', ['run', '-P', 'nginx'], /publish-all/],
    ['C2 --publish-all', ['run', '--publish-all', 'nginx'], /publish-all/],
    ['C2 -P in a cluster', ['run', '-dP', 'nginx'], /publish-all/],
    ['the API socket flag', ['run', '--use-api-socket', 'docker'], /use-api-socket/],
    ['joining censaiOS network', ['run', '--network', 'censaihub_default', 'alpine'], /own network/],
    ['a LAN-facing network', ['network', 'create', '-d', 'macvlan', 'lan'], /bridge/],
    ['forging a compose label', ['run', '-l', 'com.docker.compose.project=censaihub', 'alpine'], /compose labels/],
    ['copying files out of a container', ['container', 'cp', 'homebase:/run/censai-runner/secret', '-'], /not allowed/],
    ['a flag the gate does not know', ['run', '--made-up', 'x', 'alpine'], /does not know/],
  ])('%s', (_label, args, why) => {
    expect(refused(args)).toMatch(why);
  });

  test('B1 exec only enters containers censaiOS started, never its own', async () => {
    expect((await gate(['exec', 'homebase', 'sh']))?.code).toBe('stack-target');
    expect((await gate(['exec', 'stray', 'sh']))?.code).toBe('exec-not-runner-container');
    expect((await gate(['exec', 'oldMount', 'sh']))?.code).toBe('exec-unsafe-container');
    expect(execTarget(['exec', '-e', 'A=1', '-u', 'root', 'web', 'sh'])).toBe('web');
  });

  test('B4 a container that cannot be inspected is refused', async () => {
    expect((await gate(['exec', 'missing', 'sh']))?.code).toBe('inspect-failed');
    expect((await gate(['stop', 'missing']))?.code).toBe('inspect-failed');
  });

  test('C3 censaiOS own containers and images cannot be stopped or removed', async () => {
    for (const args of [['stop', 'postgres'], ['kill', 'homebase'], ['restart', 'postgres'], ['rm', '-f', 'postgres'], ['pause', 'postgres'], ['container', 'stop', 'homebase']]) {
      expect((await gate(args))?.code).toBe('stack-target');
    }
    expect((await gate(['rmi', '-f', 'censaihub-homebase']))?.code).toBe('stack-image');
    expect((await gate(['image', 'rm', 'postgres:18']))?.code).toBe('stack-image');
  });

  test('A1 a link inside the projects folder that leads out of it is refused', async () => {
    const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'));
    fs.mkdirSync(path.join(mirror, 'shop'));
    fs.symlinkSync('/etc', path.join(mirror, 'escape'));
    const facts = { ...FACTS, projectsRoots: ['/srv/projects'], projectsMirror: { local: mirror } };
    expect(await gate(['run', '-v', '/srv/projects/shop:/app', 'alpine'], facts)).toBeNull();
    expect((await gate(['run', '-v', '/srv/projects/escape/ssl:/x', 'alpine'], facts))?.code).toBe('mount-link-escape');
    expect((await gate(['run', '-v', '/srv/projects/escape:/x', 'alpine'], facts))?.code).toBe('mount-link-escape');
  });

  test('A1 with the whole drive as projects folder, censaiOS own folder stays out', () => {
    const facts = { ...FACTS, projectsRoots: [canonicalHostPath('D:/')] };
    expect(refused(['run', '-v', 'D:\\Notes:/x', 'alpine'], facts)).toBeNull();
    expect(refused(['run', '-v', 'D:\\Apps\\CensaiHub\\.env:/x', 'alpine'], facts)).toMatch(/own folder/);
    expect(refused(['run', '-v', 'd:/apps:/x', 'alpine'], facts)).toMatch(/own folder/);
  });

  test('A1 the default projects folder inside censaiOS folder still works, the rest of that folder does not', () => {
    const facts = { ...FACTS, projectsRoots: [canonicalHostPath('D:\\Apps\\CensaiHub\\censai-projects')] };
    expect(refused(['run', '-v', 'D:\\Apps\\CensaiHub\\censai-projects\\shop:/app', 'alpine'], facts)).toBeNull();
    expect(refused(['run', '-v', 'D:\\Apps\\CensaiHub:/x', 'alpine'], facts)).toMatch(/projects folder/);
  });

  test('with no projects folder known, no host folder can be mounted', () => {
    expect(refused(['run', '-v', 'D:\\Projects\\shop:/app', 'alpine'], { ...FACTS, projectsRoots: [] })).toMatch(/projects folder/);
  });

  test('B3/B7 the caller cannot set env, and run time and output are capped', () => {
    const docker = childOptions({ env: { DOCKER_HOST: 'tcp://evil:2375' }, cwd: '/', timeout: 99 * 3600_000, maxBuffer: 1e12, shell: true }, true);
    expect(docker).toEqual({ timeout: 30 * 60_000, maxBuffer: 50 * 1024 * 1024, shell: false, windowsHide: true });
    const local = childOptions({ env: { DOCKER_HOST: 'x' }, cwd: '/tmp', timeout: 5000 }, false);
    expect(local.env).toBeUndefined();
    expect(local).toMatchObject({ cwd: '/tmp', timeout: 5000, maxBuffer: 50 * 1024 * 1024 });
    expect(childOptions({}, true).timeout).toBe(15 * 60_000);
  });

  test('C4 run and create get censaiOS label and a memory and CPU ceiling unless they set one', () => {
    const args = withRunnerDefaults(['run', '-d', 'redis:7'], { RUNNER_CONTAINER_MEMORY: '2g', RUNNER_CONTAINER_CPUS: '1.5' });
    expect(args).toEqual(['run', '--label', 'censai.runner=1', '--memory', '2g', '--cpus', '1.5', '-d', 'redis:7']);
    const own = withRunnerDefaults(['container', 'create', '-m', '512m', '--cpus', '1', 'redis:7'], {});
    expect(own).toEqual(['container', 'create', '--label', 'censai.runner=1', '-m', '512m', '--cpus', '1', 'redis:7']);
    expect(withRunnerDefaults(['ps', '-a'])).toEqual(['ps', '-a']);
  });

  test('inspect checks still catch the socket and privileged containers', () => {
    expect(inspectViolation(JSON.stringify([{ HostConfig: {}, Mounts: [{ Source: '/var/run/docker.sock' }] }]))).toMatch(/Docker socket/);
    expect(inspectViolation(JSON.stringify([{ HostConfig: { Privileged: true }, Mounts: [] }]))).toMatch(/privileged/);
    expect(badMountSource('censai-dev-packages-1')).toBeNull();
    expect(inspectViolation(JSON.stringify([{ HostConfig: {}, Mounts: [
      { Type: 'bind', Source: '/run/desktop/mnt/host/d/Sites/shop' },
      { Type: 'volume', Source: '/var/lib/docker/volumes/censai-dev-packages-1/_data' },
    ] }]), FACTS)).toBeNull();
  });
});

describe('the runner learns its stack from Docker', () => {
  test('project, projects folder, censaiOS folder, volumes and networks', async () => {
    const runner = { Id: 'r1', Name: '/censaihub-runner-1', Config: { Labels: { 'com.docker.compose.project': 'censaihub', 'com.docker.compose.service': 'runner' } },
      Mounts: [{ Type: 'bind', Source: 'D:\\Projects', Destination: '/workspace/projects' }, { Type: 'volume', Name: 'censaihub_runner_secret', Destination: '/run/censai-runner' }],
      NetworkSettings: { Networks: { censaihub_default: {} } } };
    const app = { Id: 'h1', Name: '/censaihub-homebase-1', Config: { Image: 'censaihub-homebase', Labels: { 'com.docker.compose.project': 'censaihub', 'com.docker.compose.service': 'homebase' } },
      Mounts: [{ Type: 'bind', Source: 'D:\\Apps\\CensaiHub', Destination: '/workspace/CensaiHub' }, { Type: 'volume', Name: 'censaihub_homebase_state' }] };
    const run = async (args) => {
      if (args[0] === 'ps') return 'h1\nr1\n';
      return JSON.stringify(args.includes('h1') ? [app, runner] : [runner]);
    };
    const facts = await discoverStack(run, { env: {}, hostname: 'r1' });
    expect(facts.project).toBe('censaihub');
    expect(facts.projectsRoots).toEqual(['/run/desktop/mnt/host/d/projects']);
    expect(facts.blockedFolders).toEqual(['/run/desktop/mnt/host/d/apps/censaihub']);
    expect(facts.projectsMirror).toEqual({ local: '/workspace/projects' });
    expect([...facts.volumes]).toEqual(expect.arrayContaining(['censaihub_runner_secret', 'censaihub_homebase_state']));
    expect(facts.networks.has('censaihub_default')).toBe(true);
    expect(facts.images.has('censaihub-homebase')).toBe(true);
  });

  test('outside Docker it knows nothing, so it mounts nothing', async () => {
    const facts = await discoverStack(async () => { throw new Error('no docker'); }, { env: {}, hostname: 'x' });
    expect(facts).toMatchObject({ project: null, projectsRoots: [] });
  });
});

describe('docker-only runner service', () => {
  test('refuses before running anything, logs only a reason code, and file access is off', async () => {
    logged.length = 0;
    const app = createRunnerApp({ runnerSecret: SECRET, dockerOnly: true, run: fakeRun, stack: async () => FACTS });
    const res = await request(app).post('/exec').set('x-runner-secret', SECRET)
      .send({ command: 'sh', args: ['-c', 'echo pwned'], options: { shell: true } }).expect(200);
    expect(res.body).toMatchObject({ code: 126, stdout: '' });
    expect(res.body.stderr).toMatch(/Refused by the Docker gatekeeper/);
    const mount = await request(app).post('/exec').set('x-runner-secret', SECRET)
      .send({ command: 'docker', args: ['run', '-v', '/home/secret-folder:/x', 'alpine'] }).expect(200);
    expect(mount.body.code).toBe(126);
    const text = JSON.stringify(logged);
    expect(logged).toContainEqual(['warn', 'runner command refused by the Docker gatekeeper', { program: 'docker', reason: 'mount-outside-projects' }]);
    expect(text).not.toMatch(/secret-folder|alpine|pwned/);
    await request(app).post('/fs/read').set('x-runner-secret', SECRET).send({ path: '/etc/passwd' }).expect(403);
  });

  test('docker-only is the default unless turned off by name', async () => {
    const prev = process.env.RUNNER_DOCKER_ONLY;
    delete process.env.RUNNER_DOCKER_ONLY;
    const app = createRunnerApp({ runnerSecret: SECRET, run: fakeRun, stack: async () => FACTS });
    const res = await request(app).post('/exec').set('x-runner-secret', SECRET).send({ command: 'sh', args: ['-c', 'true'] }).expect(200);
    expect(res.body.code).toBe(126);
    if (prev !== undefined) process.env.RUNNER_DOCKER_ONLY = prev;
  });

  test('makes its secret once and reuses it', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runner-')), 'secret');
    const first = resolveRunnerSecret({ RUNNER_SECRET_FILE: file });
    expect(first).toHaveLength(64);
    expect(resolveRunnerSecret({ RUNNER_SECRET_FILE: file })).toBe(first);
    expect(resolveRunnerSecret({ RUNNER_SECRET: SECRET, RUNNER_SECRET_FILE: file })).toBe(SECRET);
  });
});
