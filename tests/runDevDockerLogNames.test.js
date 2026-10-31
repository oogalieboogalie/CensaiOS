import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Run dev and Docker name things after a project's folder: a Run dev
// container is censai-dev-<folder>-<hash>, and a compose project, its
// containers, volumes and networks carry their folder's name. None of their
// log lines or logged addresses may name a folder; Run dev keeps the hash.
// Made-up folders for Pat Example.
const FOLDER = '/home/pat-example/Made-up Garden Plans';
const LEFT_OPEN = '/home/pat-example/made-up-recipes';
const STUCK = '/home/pat-example/made-up-taxes';
const STACK = 'made-up-bakery';
const NAMED = /made-up|garden|recipes|taxes|bakery|pat-example/i;

// A tiny engine: Run dev's containers, and one compose stack Docker named
// after its folder, as `docker compose up` does by default.
function createEngine() {
  const rows = new Map([[`${STACK}-web-1`, {
    ID: 'c0ffee000001', Names: `${STACK}-web-1`, State: 'running', Status: 'Up 2 hours', Ports: '',
    Labels: `com.docker.compose.project=${STACK},com.docker.compose.service=web`,
  }]]);
  const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
  const fail = (stderr) => ({ stdout: '', stderr, code: 1 });
  const find = (ref) => [...rows.values()].find((r) => r.ID === ref || r.Names === ref);
  const engine = { failRemove: null };
  engine.exec = (cmd, args) => {
    const [verb, ...rest] = args;
    const target = rest[rest.length - 1];
    switch (verb) {
      case 'image': return ok('[]');
      case 'run': {
        const name = args[args.indexOf('--name') + 1];
        const labels = args.filter((a, i) => args[i - 1] === '--label').join(',');
        const id = `5eed${String(rows.size).padStart(8, '0')}`;
        rows.set(name, { ID: id, Names: name, State: 'running', Status: 'Up 1 second', Labels: labels, Ports: '127.0.0.1:49300->3000/tcp' });
        return ok(id);
      }
      case 'ps': return ok([...rows.values()].filter((r) => !args.includes('label=censai.devserver=1') || r.Labels.includes('censai.devserver=1'))
        .map((r) => JSON.stringify(r)).join('\n'));
      case 'exec': case 'logs': return ok();
      case 'inspect': return find(target) ? ok(JSON.stringify([{ Name: `/${find(target).Names}` }])) : fail(`No such container: ${target}`);
      case 'rm':
        if (engine.failRemove === target) return fail('Error response from daemon: permission denied');
        return rows.delete(find(target)?.Names) ? ok(target) : fail(`Error response from daemon: No such container: ${target}`);
      case 'stop': case 'restart': return find(target) ? ok(target) : fail(`No such container: ${target}`);
      case 'volume': case 'network': return ok(target);
      case 'compose': return ok(rest[0] === 'ls' ? JSON.stringify({ Name: STACK, Status: 'running(1)', ConfigFiles: `/home/pat-example/${STACK}/compose.yaml` }) : '');
      default: return fail(`unknown verb ${verb}`);
    }
  };
  engine.rows = rows;
  return engine;
}

let engine = createEngine();
jest.unstable_mockModule('../server/runner/client.js', () => ({
  runnerClient: { exec: jest.fn(async (cmd, args) => engine.exec(cmd, args)) },
}));

const { onLogRecord, redactUrl } = await import('../server/logger.js');
const { requestLogger } = await import('../server/boot/requestLog.js');
const { devServersRouter } = await import('../server/routes/devServers.js');
const { dockerRouter } = await import('../server/routes/docker.js');
const { containerName, projectKey } = await import('../server/devServers/manager.js');
const reaper = await import('../server/devServers/reaper.js');

const app = express();
app.use(express.json());
app.use(requestLogger());
app.use('/api/dev-servers', devServersRouter);
app.use('/api/docker', dockerRouter);

const records = [];
onLogRecord((r) => records.push(r));
const lines = (namespace) => records.filter((r) => r.namespace === namespace).map((r) => `${r.level} ${r.message}`);
const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => { engine = createEngine(); records.length = 0; reaper.resetReaperForTests(); });

describe('Run dev and Docker never name a project\'s folder in the logs', () => {
  test('Run dev\'s addresses keep the folder\'s hash, never the folder', async () => {
    const started = (await request(app).post('/api/dev-servers').send({ folder: FOLDER })).body;
    const hash = projectKey(FOLDER);
    // The container itself is named after the folder: that is why the log must not repeat it.
    expect(started.name).toBe(containerName(FOLDER));
    expect(started.name).toBe(`censai-dev-made-up-garden-plans-${hash}`);
    await flush();
    expect((await request(app).get(`/api/dev-servers/${started.name}`)).body).toMatchObject({ phase: 'ready', folder: FOLDER });
    expect((await request(app).post('/api/dev-servers/heartbeat').send({ names: [started.name] })).status).toBe(200);
    // Run dev's log view asks Docker for the container's lines by its name.
    expect((await request(app).get(`/api/docker/containers/${started.name}/logs?tail=300`)).status).toBe(200);
    const id = engine.rows.get(started.name).ID;
    expect((await request(app).post(`/api/docker/containers/${id}/restart`)).status).toBe(200);
    expect((await request(app).delete(`/api/dev-servers/${started.name}`)).status).toBe(200);

    expect(lines('http').map((l) => l.replace(/ \d+ms$/, ''))).toEqual([
      'info POST /api/dev-servers 200',
      `info GET /api/dev-servers/censai-dev-[redacted]-${hash} 200`,
      'info POST /api/dev-servers/heartbeat 200',
      `info GET /api/docker/containers/censai-dev-[redacted]-${hash}/logs?tail=300 200`,
      `info POST /api/docker/containers/${id}/restart 200`,
      `info DELETE /api/dev-servers/censai-dev-[redacted]-${hash} 200`,
    ]);
    expect(lines('docker')).toEqual([`info restart container censai-dev-[redacted]-${hash}: done`]);
    expect(JSON.stringify(records)).not.toMatch(NAMED);
  });

  test('Docker\'s lines and addresses never name a compose project, its container, volume or network', async () => {
    for (const [method, url] of [
      ['post', `/api/docker/compose/${STACK}/restart`],
      ['post', `/api/docker/containers/${STACK}-web-1/stop`],
      ['delete', `/api/docker/volumes/${STACK}_data`],
      ['delete', `/api/docker/networks/${STACK}_default`],
    ]) expect([url, (await request(app)[method](url)).status]).toEqual([url, 200]);

    expect(lines('http').map((l) => l.replace(/ \d+ms$/, ''))).toEqual([
      'info POST /api/docker/compose/[redacted]/restart 200',
      'info POST /api/docker/containers/[redacted]/stop 200',
      'info DELETE /api/docker/volumes/[redacted] 200',
      'info DELETE /api/docker/networks/[redacted] 200',
    ]);
    expect(lines('docker')).toEqual(['info compose restart: done', 'info stop container: done', 'info remove volume: done', 'info remove network: done']);
    expect(JSON.stringify(records)).not.toMatch(NAMED);
  });

  test('clearing away idle containers counts them and names a folder\'s hash, never the folder', async () => {
    for (const folder of [LEFT_OPEN, STUCK]) await request(app).post('/api/dev-servers').send({ folder });
    await flush();
    engine.failRemove = containerName(STUCK);
    const removed = await reaper.reapIdle(Date.now() + reaper.IDLE_MS + 1000);
    expect(removed).toEqual([containerName(LEFT_OPEN)]);

    const said = records.filter((r) => r.namespace === 'dev-servers');
    expect(said.map((r) => [r.level, r.message, r.meta])).toEqual([
      ['warn', 'Could not remove idle dev server', expect.objectContaining({ folderHash: projectKey(STUCK) })],
      ['info', 'Removed dev servers no window is using', { count: 1, folderHashes: [projectKey(LEFT_OPEN)] }],
    ]);
    expect(JSON.stringify(records)).not.toMatch(NAMED);
  });

  test('an address keeps the route, the action and Docker\'s ids; a folder\'s name never', () => {
    expect(redactUrl('/api/dev-servers/censai-dev-made-up-shop-0123456789/logs?tail=400')).toBe('/api/dev-servers/censai-dev-[redacted]-0123456789/logs?tail=400');
    expect(redactUrl('/api/dev-servers/made-up-shop')).toBe('/api/dev-servers/[redacted]');
    expect(redactUrl('/api/dev-servers/heartbeat')).toBe('/api/dev-servers/heartbeat');
    expect(redactUrl('/api/docker/containers/0123456789ab/logs?tail=20')).toBe('/api/docker/containers/0123456789ab/logs?tail=20');
    expect(redactUrl('/api/docker/containers/made-up-shop-web-1/stop')).toBe('/api/docker/containers/[redacted]/stop');
    expect(redactUrl('/API/Docker/Volumes/made-up-shop_data')).toBe('/API/Docker/Volumes/[redacted]');
    for (const plain of ['/api/dev-servers', '/api/docker/containers', '/api/docker/compose', '/api/docker/prune/images', '/api/docker/images/history?ref=x']) {
      expect(redactUrl(plain)).toBe(plain.replace('ref=x', 'ref=[redacted]'));
    }
  });
});
