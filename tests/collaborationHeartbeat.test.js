// A browser that vanishes without closing its socket (a laptop lid shut, the
// Wi-Fi gone) is cut by the board socket's heartbeat, so the others' people
// list loses it within two heartbeats instead of when the operating system
// gives up on the connection. A browser that answers stays connected.
import http from 'node:http';
import { WebSocket } from 'ws';
import {
  attachWorkspaceCollaborationWs,
  WORKSPACE_COLLABORATION_PATH,
} from '../server/ws/workspaceCollaboration.js';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';

const BEAT_MS = 40;
let server;
let wss;
const sockets = [];

const memberDb = {
  query: async (_sql, [workspaceId]) => ({ rows: [{ id: workspaceId, name: workspaceId, role: 'member' }] }),
};

function join(clientId, userId, options = {}) {
  const path = `${WORKSPACE_COLLABORATION_PATH}?workspaceId=board-1&clientId=${clientId}&user=${userId}`;
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${path}`, options);
  sockets.push(ws);
  const lists = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.participants) lists.push(message.participants.map((p) => p.clientId).sort().join(','));
  });
  return {
    ws,
    lists,
    opened: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }),
    closed: new Promise((resolve) => { ws.once('close', resolve); }),
  };
}

async function until(check, timeoutMs = 2000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}

beforeEach(async () => {
  __resetWorkspaceHubForTests();
  server = http.createServer();
  wss = attachWorkspaceCollaborationWs(server, {
    db: memberDb,
    heartbeatMs: BEAT_MS,
    authenticate: async (request) => ({ userId: new URL(request.url, 'http://localhost').searchParams.get('user') }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  wss.close();
  await new Promise((resolve) => server.close(resolve));
  __resetWorkspaceHubForTests();
});

test('a browser that stops answering is cut and leaves the people list; one that answers stays', async () => {
  const pat = join('pat-tab', '1');
  // Like a laptop gone to sleep: the socket is open but nothing answers.
  const sam = join('sam-tab', '2', { autoPong: false });
  await Promise.all([pat.opened, sam.opened]);
  await until(() => pat.lists.includes('pat-tab,sam-tab'));

  await sam.closed;
  await until(() => pat.lists.at(-1) === 'pat-tab');
  await new Promise((resolve) => { setTimeout(resolve, BEAT_MS * 6); });
  expect(pat.ws.readyState).toBe(WebSocket.OPEN);
  expect(pat.lists.at(-1)).toBe('pat-tab');
});
