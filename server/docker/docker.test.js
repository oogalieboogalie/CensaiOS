import { jest } from '@jest/globals';
import { createFakeDocker } from '../../tests/fixtures/dockerFake.js';

let fake = createFakeDocker();
const exec = jest.fn((command, args) => Promise.resolve(fake.exec(command, args)));
jest.unstable_mockModule('../runner/client.js', () => ({ runnerClient: { exec } }));

const engine = await import('./engine.js');
const actions = await import('./actions.js');
const cli = await import('./cli.js');

beforeEach(() => {
  fake = createFakeDocker();
  exec.mockClear();
});

const lastArgs = () => exec.mock.calls[exec.mock.calls.length - 1][1];

describe('docker engine reads', () => {
  test('engineStatus reports the engine, counts and disk usage', async () => {
    const s = await engine.engineStatus();
    expect(s.available).toBe(true);
    expect(s.engine).toMatchObject({ version: '27.3.1', cpus: 16 });
    expect(s.counts).toMatchObject({ containers: 9, running: 7, stopped: 2 });
    expect(s.disk.find((d) => d.type === 'Images').size).toBe(8_370_000_000);
  });

  test.each([
    ['down', 'daemon-down'],
    ['missing', 'not-installed'],
  ])('engineStatus says why Docker is unavailable (%s)', async (daemon, reason) => {
    fake = createFakeDocker({ daemon });
    const s = await engine.engineStatus();
    expect(s).toMatchObject({ available: false, reason });
    expect(s.message).toMatch(/Docker/);
  });

  test('runner disabled is reported as unavailable, not a crash', async () => {
    exec.mockImplementationOnce(() => Promise.reject(new Error('Dangerous execution is disabled. Enable RUNNER_ENABLED')));
    exec.mockImplementationOnce(() => Promise.reject(new Error('Dangerous execution is disabled.')));
    await expect(engine.engineStatus()).resolves.toMatchObject({ available: false, reason: 'runner-disabled' });
  });

  test('a remote runner without its secret is reported as unreachable', async () => {
    exec.mockImplementation(() => Promise.reject(new Error('RUNNER_SECRET is required.')));
    try {
      await expect(engine.engineStatus()).resolves.toMatchObject({ available: false, reason: 'runner-unreachable' });
    } finally {
      exec.mockImplementation((command, args) => Promise.resolve(fake.exec(command, args)));
    }
  });

  test('listContainers normalizes state, health, compose labels and sandboxes', async () => {
    const list = await engine.listContainers();
    expect(lastArgs()).toEqual(['ps', '-a', '--no-trunc', '--format', 'json']);
    const app = list.find((c) => c.name === 'homebase-app-1');
    expect(app).toMatchObject({ state: 'running', health: 'healthy', composeProject: 'homebase', composeService: 'app', shortId: 'a1a1a1a1a1a1' });
    expect(app.ports).toEqual(['0.0.0.0:3001->3001/tcp', ':::3001->3001/tcp']);
    expect(list.find((c) => c.name === 'automation-qdrant-1').health).toBe('unhealthy');
    expect(list.find((c) => c.name === 'homebase-sbx-7f3a2c')).toMatchObject({ sandbox: true, hostPath: '/home/alex/projects/leadhound' });
    expect(list.find((c) => c.name === 'nightly-migrate')).toMatchObject({ state: 'exited', health: null });
  });

  test('containerStats parses percentages and sizes, keyed by short id', async () => {
    const stats = await engine.containerStats();
    const pg = stats.find((s) => s.id === 'b2b2b2b2b2b2');
    expect(pg.memUsed).toBe(Math.round(186.4 * 1024 ** 2));
    expect(pg.memPercent).toBeCloseTo(1.17);
    expect(pg.pids).toBe(14);
    expect(pg.cpu).toBeGreaterThan(0);
  });

  test('inspectContainer summarizes and hides secret-looking env values', async () => {
    const info = await engine.inspectContainer('homebase-app-1');
    expect(info.name).toBe('homebase-app-1');
    expect(info.health.status).toBe('healthy');
    expect(info.ports).toEqual([{ target: '3001/tcp', published: ['0.0.0.0:3001'] }]);
    const key = info.env.find((e) => e.key === 'OPENAI_API_KEY');
    expect(key).toEqual({ key: 'OPENAI_API_KEY', value: '••••••', masked: true });
    expect(info.env.find((e) => e.key === 'PORT').value).toBe('3001');
    expect(JSON.stringify(info)).not.toContain('sk-live');
  });

  test('containerLogs merges stdout and stderr in timestamp order', async () => {
    const lines = await engine.containerLogs('homebase-app-1', { tail: 50 });
    expect(lastArgs()).toEqual(['logs', '--timestamps', '--tail=50', 'homebase-app-1']);
    expect(lines).toHaveLength(10);
    expect(lines[3]).toMatchObject({ stream: 'stderr', text: expect.stringContaining('rate limited') });
    expect(lines.map((l) => l.ts)).toEqual([...lines.map((l) => l.ts)].sort());
  });

  test('images, volumes and networks know what is in use', async () => {
    const images = await engine.listImages();
    expect(images.find((i) => i.ref === 'postgres:16-alpine').inUseBy).toEqual(['homebase-postgres-1']);
    expect(images.find((i) => i.dangling).inUseBy).toEqual([]);
    const volumes = await engine.listVolumes();
    expect(volumes.find((v) => v.name === 'homebase_pgdata')).toMatchObject({ composeProject: 'homebase', inUseBy: ['homebase-postgres-1'] });
    const networks = await engine.listNetworks();
    expect(networks.find((n) => n.name === 'bridge').builtin).toBe(true);
    expect(networks.find((n) => n.name === 'legacy_backend')).toMatchObject({ internal: true, inUseBy: [] });
  });

  test('listComposeProjects groups services and keeps config files', async () => {
    const projects = await engine.listComposeProjects();
    const hb = projects.find((p) => p.name === 'homebase');
    expect(hb).toMatchObject({ running: 3, total: 3, configFiles: ['/home/alex/Homebase/docker-compose.yml'] });
    expect(hb.services.map((s) => s.service).sort()).toEqual(['app', 'postgres', 'redis']);
  });
});

describe('docker actions', () => {
  test('container lifecycle actions run the matching verb', async () => {
    await actions.containerAction('homebase-redis-1', 'stop');
    expect(lastArgs()).toEqual(['stop', 'homebase-redis-1']);
    expect((await engine.listContainers()).find((c) => c.name === 'homebase-redis-1').state).toBe('exited');
    await actions.containerAction('homebase-redis-1', 'start');
    expect((await engine.listContainers()).find((c) => c.name === 'homebase-redis-1').state).toBe('running');
  });

  test('rejects unknown verbs and refs that could be read as flags', async () => {
    await expect(actions.containerAction('x', 'commit')).rejects.toMatchObject({ status: 400 });
    await expect(actions.containerAction('-rf', 'stop')).rejects.toMatchObject({ status: 400 });
    await expect(actions.removeImage('--all')).rejects.toMatchObject({ status: 400 });
    await expect(engine.containerLogs('a b')).rejects.toMatchObject({ status: 400 });
    expect(exec).not.toHaveBeenCalled();
  });

  test('removeContainer surfaces Docker\'s own error and force removes', async () => {
    await expect(actions.removeContainer('ollama')).rejects.toThrow(/container is running/);
    await actions.removeContainer('ollama', { force: true });
    expect(lastArgs()).toEqual(['rm', '-f', 'ollama']);
  });

  test('exec runs through the container shell and reports exit status', async () => {
    const r = await actions.execInContainer('homebase-app-1', 'ls -la /app', { platformIsWindows: false });
    expect(lastArgs()).toEqual(['exec', 'homebase-app-1', 'sh', '-c', 'ls -la /app']);
    expect(r).toMatchObject({ ok: true, exitCode: 0, stdout: expect.stringContaining('package.json') });
    const bad = await actions.execInContainer('homebase-app-1', 'exit 3', { platformIsWindows: false });
    expect(bad.ok).toBe(false);
    await expect(actions.execInContainer('homebase-app-1', '   ')).rejects.toMatchObject({ status: 400 });
  });

  test('exec on Windows passes plain argv instead of a shell line', async () => {
    await actions.execInContainer('homebase-app-1', 'cat "/etc/os release"', { platformIsWindows: true });
    expect(lastArgs()).toEqual(['exec', 'homebase-app-1', 'cat', '/etc/os release']);
  });

  test('images pull and prune; volume errors pass through', async () => {
    await actions.pullImage('nginx:alpine');
    expect(lastArgs()).toEqual(['pull', '--quiet', 'nginx:alpine']);
    await expect(actions.prune('images')).resolves.toMatchObject({ reclaimed: '1.19GB' });
    await expect(actions.prune('system')).rejects.toMatchObject({ status: 400 });
    await expect(actions.removeVolume('homebase_pgdata')).rejects.toThrow(/volume is in use/);
  });

  test('compose actions target the project and its compose files', async () => {
    await actions.composeAction('homebase', 'up');
    expect(lastArgs()).toEqual(['compose', '-p', 'homebase', '-f', '/home/alex/Homebase/docker-compose.yml', 'up', '-d']);
    await expect(actions.composeAction('nope', 'up')).rejects.toMatchObject({ status: 400 });
    await expect(actions.composeAction('homebase', 'exec')).rejects.toMatchObject({ status: 400 });
  });
});

describe('cli helpers', () => {
  test('prepareArgs quotes spaces on Windows and refuses shell metacharacters', () => {
    expect(cli.prepareArgs(['compose', '-f', 'C:\\My Stacks\\compose.yml'], true)).toEqual(['compose', '-f', '"C:\\My Stacks\\compose.yml"']);
    expect(() => cli.prepareArgs(['exec', 'x', 'a&calc'], true)).toThrow(/Windows/);
    expect(cli.prepareArgs(['a&b'], false)).toEqual(['a&b']);
  });

  test('tokenize honours quotes', () => {
    expect(actions.tokenize(`echo "a b" 'c' d`)).toEqual(['echo', 'a b', 'c', 'd']);
    expect(() => actions.tokenize('echo "oops')).toThrow(/quote/);
  });

  test('parseSize handles binary and decimal units', () => {
    expect(engine.parseSize('1.5GiB')).toBe(Math.round(1.5 * 1024 ** 3));
    expect(engine.parseSize('900kB')).toBe(900_000);
    expect(engine.parseSize('0B')).toBe(0);
    expect(engine.parseSize('')).toBe(0);
  });
});
