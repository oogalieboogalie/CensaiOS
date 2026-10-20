// Canvas core with Redis: two server processes share one live room. Runs only
// where a redis-server binary exists (skipped otherwise).
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { attachHocuspocusWs, createHocuspocusServer, HOCUSPOCUS_PATH } from '../server/collab/hocuspocus.js';
import { createYjsPersistence } from '../server/collab/yPersistence.js';
import { createYUpdateLog } from '../server/collab/yUpdateLog.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { readAwarenessPresence } from '../src/lib/collaboration/awarenessPresence.js';
import { yjsMemoryDb } from './support/yjsMemoryDb.js';

const hasRedis = spawnSync('redis-server', ['--version']).status === 0;
const maybe = hasRedis ? describe : describe.skip;
const PORT = 16379 + Math.floor(Math.random() * 1000);

maybe('two server processes, one board', () => {
  let redis;
  const servers = [];
  const providers = [];

  beforeAll(async () => {
    redis = spawn('redis-server', ['--port', String(PORT), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  afterAll(async () => {
    for (const provider of providers) provider.destroy();
    // Let the rooms unload (and unsubscribe from Redis) before quitting.
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const { server, hocuspocus } of servers) {
      await hocuspocus.closeConnections?.();
      // Quit the Redis pub/sub clients, or they keep reconnecting after the
      // test and slow every later suite in the run.
      await hocuspocus.hooks('onDestroy', { instance: hocuspocus });
      await new Promise((resolve) => server.close(resolve));
    }
    redis?.kill();
  });

  async function startServer(db, name) {
    const log = createYUpdateLog(db, { batchMs: 5 });
    const persistence = createYjsPersistence({ db, log, ensureSchema: async () => {} });
    const hocuspocus = createHocuspocusServer({
      persistence,
      redis: { host: '127.0.0.1', port: PORT, prefix: 'canvas-test', identifier: name, disconnectDelay: 0, options: {} },
      config: { debounce: 20, maxDebounce: 50, quiet: true },
    });
    const server = http.createServer();
    attachHocuspocusWs(server, {
      db: { query: async (_sql, [id]) => ({ rows: [{ id, name: id, role: 'member' }] }) },
      authenticate: (request) => ({ userId: new URL(request.url, 'http://x').searchParams.get('user') }),
      hocuspocus,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push({ server, hocuspocus, log });
    return server;
  }

  function join(server, user) {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${server.address().port}${HOCUSPOCUS_PATH}?workspaceId=ws-r&user=${user}`,
      name: 'ws-r',
      document: doc,
      WebSocketPolyfill: WebSocket,
    });
    providers.push(provider);
    return { doc, provider, synced: new Promise((resolve) => provider.on('synced', resolve)) };
  }

  async function until(check, timeoutMs = 5000) {
    const started = Date.now();
    while (!check()) {
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the other process');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  test('an edit and a cursor on process A show up for someone on process B', async () => {
    const db = yjsMemoryDb();
    const a = await startServer(db, 'process-a');
    const b = await startServer(db, 'process-b');
    const alma = join(a, 'alma');
    const sam = join(b, 'sam');
    await Promise.all([alma.synced, sam.synced]);

    const prev = readDocState(alma.doc);
    writeStateToDoc(alma.doc, prev, { ...prev, wins: [{ id: 'w1', kind: 'note', x: 1, y: 2, w: 300, h: 200 }] });
    await until(() => readDocState(sam.doc).wins.length === 1);

    alma.provider.awareness.setLocalStateField('user', { id: 'alma', name: 'Alma', color: 'red' });
    alma.provider.awareness.setLocalStateField('cursor', { x: 3, y: 4 });
    const seen = () => readAwarenessPresence(sam.provider.awareness.getStates(), sam.provider.awareness.clientID);
    await until(() => Object.values(seen().cursors).some((c) => c.actor.label === 'Alma'));

    await new Promise((resolve) => setTimeout(resolve, 150));
    await Promise.all(servers.map(({ log }) => log.flush()));
    // Logged once, by the process that received it, not again by the relay.
    expect(db.rows().map((row) => row.actor)).toEqual(['user:alma']);
  });
});
