import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { onLogRecord } from '../server/logger.js';
import { createYjsPersistence } from '../server/collab/yPersistence.js';
import { attachAgentRegistryWs, WS_PATH } from '../server/ws/agentRegistry.js';

const SECRET = 'made-up-secret-137 postgres://pat:pw@db.internal/board';
const failure = () => Object.assign(new Error(SECRET), { code: 'ECONNRESET' });

function capture() {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  return { records, stop };
}

test('a board that fails to load logs fixed lines with a code, never the error text', async () => {
  const { records, stop } = capture();
  const fakeLog = {
    load: async () => { throw failure(); },
    append: () => {}, flush: async () => {}, compact: async () => {},
  };
  const persistence = createYjsPersistence({
    db: {}, log: fakeLog, ensureSchema: async () => {},
    loadSnapshot: async () => { throw failure(); }, backup: async () => {},
  });
  await persistence.onLoadDocument({ document: new Y.Doc(), documentName: 'ws-made-up' });
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('yjs doc load failed');
  expect(text).toContain('yjs snapshot migration failed');
  expect(text).toContain('ECONNRESET');
  expect(text).toContain('ws-made-up');
  expect(text).not.toContain('made-up-secret-137');
  expect(text).not.toContain('db.internal');
});

test('a failed agent-registry sign-in check logs a code, never the error text', async () => {
  const server = http.createServer();
  attachAgentRegistryWs(server, { authenticate: async () => { throw failure(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { records, stop } = capture();
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${WS_PATH}`);
  await new Promise((resolve) => { ws.on('error', resolve); ws.on('unexpected-response', resolve); ws.on('close', resolve); });
  ws.terminate();
  await new Promise((resolve) => server.close(resolve));
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('upgrade auth failed');
  expect(text).toContain('ECONNRESET');
  expect(text).not.toContain('made-up-secret-137');
});

test('no log call in the board-sharing and start-up files passes the error text', () => {
  const files = ['collab/yPersistence.js', 'collab/yUpdateLog.js', 'collab/serverWriter.js', 'collab/agentPresence.js',
    'ws/workspaceCollaboration.js', 'ws/agentRegistry.js', 'ws/registryHub.js', 'boot/database.js', 'boot/lifecycle.js', 'db.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve('server', file), 'utf8');
    const logCalls = source.split('\n').filter((line) => /log\.(info|warn|error|debug)\(/.test(line));
    expect({ file, leaks: logCalls.filter((line) => /(err|error)\.message/.test(line)) }).toEqual({ file, leaks: [] });
    expect(source).toContain('safeErrorCode(');
  }
});
