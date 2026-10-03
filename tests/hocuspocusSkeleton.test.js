import http from 'node:http';
import { WebSocket } from 'ws';
import {
  applyConnectionAccess,
  attachHocuspocusWs,
  createHocuspocusServer,
  HOCUSPOCUS_PATH,
  readOnlyForRole,
} from '../server/collab/hocuspocus.js';
import {
  CANVAS_KEYS,
  CANVAS_ROOT,
  SCHEMA_VERSION,
  isValidCoordinate,
  isValidId,
  isValidWindowGeometry,
} from '../server/collab/ySchema.js';

let server;
let hocuspocus;
const sockets = [];

function membershipDb() {
  return {
    query: async (_sql, [workspaceId, userId]) => {
      if (userId === 'outsider') return { rows: [] };
      const role = userId === 'viewer-user' ? 'viewer' : 'member';
      return { rows: [{ id: workspaceId, name: workspaceId, role }] };
    },
  };
}

function authenticateStub(request) {
  const user = new URL(request.url, 'http://localhost').searchParams.get('user');
  return user ? { userId: user } : null;
}

function urlFor(workspaceId, user) {
  const base = `ws://127.0.0.1:${server.address().port}${HOCUSPOCUS_PATH}`
    + `?workspaceId=${workspaceId}`;
  return user ? `${base}&user=${user}` : base;
}

function connect(url) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, opened };
}

function rejectionStatus(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('upgrade rejection timed out')), 2000);
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode);
    });
    ws.once('error', () => {});
  });
}

async function runOnConnect(role) {
  const connectionConfig = { readOnly: false, isAuthenticated: true };
  await hocuspocus.hooks('onConnect', {
    context: { userId: 'u', workspace: { id: 'workspace-a', role }, readOnly: readOnlyForRole(role) },
    documentName: 'workspace-a',
    instance: hocuspocus,
    request: { url: `${HOCUSPOCUS_PATH}?workspaceId=workspace-a` },
    requestHeaders: {},
    requestParameters: new URLSearchParams('workspaceId=workspace-a'),
    socketId: 'test-socket',
    connectionConfig,
    providerVersion: null,
  });
  return connectionConfig.readOnly;
}

beforeEach(async () => {
  hocuspocus = createHocuspocusServer();
  server = http.createServer();
  attachHocuspocusWs(server, {
    db: membershipDb(),
    authenticate: authenticateStub,
    hocuspocus,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    try { socket.terminate(); } catch { /* already closed */ }
  }
  await new Promise((resolve) => server.close(resolve));
});

test('workspace member connects to the hocuspocus endpoint', async () => {
  const { opened } = connect(urlFor('workspace-a', '7'));
  await expect(opened).resolves.toBeUndefined();
});

test('missing session is rejected with 401', async () => {
  await expect(rejectionStatus(urlFor('workspace-a', null))).resolves.toBe(401);
});

test('non-member is rejected with 403', async () => {
  await expect(rejectionStatus(urlFor('workspace-a', 'outsider'))).resolves.toBe(403);
});

test('viewer connects but the connection is read-only', async () => {
  const { opened } = connect(urlFor('workspace-a', 'viewer-user'));
  await expect(opened).resolves.toBeUndefined();
  expect(readOnlyForRole('viewer')).toBe(true);
  expect(readOnlyForRole('member')).toBe(false);
  await expect(runOnConnect('viewer')).resolves.toBe(true);
  await expect(runOnConnect('member')).resolves.toBe(false);
  // Unauthenticated hook payloads (no upgrade-injected workspace) are refused.
  expect(() => applyConnectionAccess({}, { readOnly: false })).toThrow(/workspace context/);
});

test('ySchema registry carries the phase-1 contract', async () => {
  expect(SCHEMA_VERSION).toBe(1);
  expect(CANVAS_ROOT).toBe('canvas');
  expect(CANVAS_KEYS).toMatchObject({
    windows: 'Y.Map', groups: 'Y.Map', paths: 'Y.Array',
    links: 'Y.Array', dock: 'Y.Map', meta: 'Y.Map',
  });
  expect(isValidId('win-1')).toBe(true);
  expect(isValidId('bad id!')).toBe(false);
  expect(isValidCoordinate(1_000_000)).toBe(true);
  expect(isValidCoordinate(Infinity)).toBe(false);
  expect(isValidWindowGeometry({
    id: 'win-1', x: 10, y: -20, w: 320, h: 240,
  })).toBe(true);
  expect(isValidWindowGeometry({ id: 'win-1', x: Infinity, y: 0, w: 1, h: 1 })).toBe(false);
});
