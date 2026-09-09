import http from 'node:http';
import { WebSocket } from 'ws';
import {
  attachWorkspaceCollaborationWs,
  WORKSPACE_COLLABORATION_PATH,
} from '../server/ws/workspaceCollaboration.js';
import { attachAgentRegistryWs } from '../server/ws/agentRegistry.js';
import {
  __resetWorkspaceHubForTests,
  publishWorkspaceEvent,
} from '../server/collaboration/workspaceHub.js';

let server;
const sockets = [];

function membershipDb() {
  return {
    query: async (_sql, [workspaceId, userId]) => ({
      rows: userId === 'outsider' ? [] : [{ id: workspaceId, name: workspaceId, role: 'member' }],
    }),
  };
}

function openPath(workspaceId, clientId, userId = '7') {
  const port = server.address().port;
  return `${WORKSPACE_COLLABORATION_PATH}?workspaceId=${workspaceId}`
    + `&clientId=${clientId}&user=${userId}&port=${port}`;
}

function connect(workspaceId, clientId, userId) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${openPath(workspaceId, clientId, userId)}`);
  sockets.push(ws);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(({ predicate }) => predicate(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else queue.push(message);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const next = (predicate = () => true, timeoutMs = 1000) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter);
        if (current >= 0) waiters.splice(current, 1);
        reject(new Error('timeout waiting for collaboration event'));
      }, timeoutMs);
    });
  };
  return { ws, opened, next, send: (value) => ws.send(JSON.stringify(value)) };
}

beforeEach(async () => {
  __resetWorkspaceHubForTests();
  server = http.createServer();
  // Match production attachment order: the existing registry handler must
  // leave collaboration upgrades available for their owning handler.
  attachAgentRegistryWs(server, {
    authenticate: async () => ({ userId: 'registry-test-user' }),
  });
  attachWorkspaceCollaborationWs(server, {
    db: membershipDb(),
    authenticate: async (request) => ({
      userId: new URL(request.url, 'http://localhost').searchParams.get('user'),
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    try { socket.terminate(); } catch { /* already closed */ }
  }
  await new Promise((resolve) => server.close(resolve));
  __resetWorkspaceHubForTests();
});

test('two workspace members receive truthful presence and isolated drag previews', async () => {
  const first = connect('workspace-a', 'client-a', '7');
  const second = connect('workspace-a', 'client-b', '8');
  const other = connect('workspace-b', 'client-c', '9');
  await Promise.all([first.opened, second.opened, other.opened]);
  await Promise.all([
    first.next((event) => event.type === 'collaboration.ready'),
    second.next((event) => event.type === 'collaboration.ready'),
    other.next((event) => event.type === 'collaboration.ready'),
  ]);

  const presence = await second.next((event) => event.type === 'presence.snapshot'
    && event.participants.length === 2);
  expect(presence.participants.map((entry) => entry.actor.id).sort()).toEqual(['7', '8']);

  first.send({
    type: 'window.preview', windowId: 'win-1', x: 123, y: -45, phase: 'move', sequence: 4,
  });
  await expect(second.next((event) => event.type === 'window.preview')).resolves.toMatchObject({
    windowId: 'win-1', x: 123, y: -45, clientId: 'client-a',
    actor: { type: 'human', id: '7', label: 'Member 7' },
  });
  await expect(other.next((event) => event.type === 'window.preview', 150)).rejects.toThrow(/timeout/);
});

test('invalid previews are rejected and authoritative commits stay workspace-scoped', async () => {
  const member = connect('workspace-a', 'member', '7');
  const peer = connect('workspace-a', 'peer', '8');
  const other = connect('workspace-b', 'other', '9');
  await Promise.all([member.opened, peer.opened, other.opened]);
  await Promise.all([
    member.next((event) => event.type === 'collaboration.ready'),
    peer.next((event) => event.type === 'collaboration.ready'),
    other.next((event) => event.type === 'collaboration.ready'),
  ]);

  member.send({ type: 'window.preview', windowId: 'win-1', x: Infinity, y: 0 });
  await expect(member.next((event) => event.type === 'error')).resolves.toMatchObject({
    reason: 'invalid-window-preview',
  });

  publishWorkspaceEvent('workspace-a', {
    type: 'workspace.committed', revision: 3, value: { wins: [] },
  });
  await expect(peer.next((event) => event.type === 'workspace.committed')).resolves.toMatchObject({ revision: 3 });
  await expect(other.next((event) => event.type === 'workspace.committed', 150)).rejects.toThrow(/timeout/);
});

test('non-members are rejected before the websocket opens', async () => {
  const path = openPath('workspace-a', 'outsider-client', 'outsider');
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${path}`);
  const status = await new Promise((resolve) => {
    ws.once('unexpected-response', (_request, response) => resolve(response.statusCode));
    ws.once('error', () => resolve(null));
  });
  expect(status).toBe(403);
});

test('cursor, typing, and text previews relay workspace-scoped and ephemeral', async () => {
  const first = connect('workspace-a', 'client-a', '7');
  const second = connect('workspace-a', 'client-b', '8');
  const other = connect('workspace-b', 'client-c', '9');
  await Promise.all([first.opened, second.opened, other.opened]);
  await Promise.all([
    first.next((event) => event.type === 'collaboration.ready'),
    second.next((event) => event.type === 'collaboration.ready'),
    other.next((event) => event.type === 'collaboration.ready'),
  ]);

  first.send({ type: 'cursor.move', x: 10.5, y: -20 });
  await expect(second.next((event) => event.type === 'cursor.move')).resolves.toMatchObject({
    x: 10.5, y: -20, clientId: 'client-a',
  });

  first.send({ type: 'typing', windowId: 'doc-1' });
  await expect(second.next((event) => event.type === 'typing')).resolves.toMatchObject({
    windowId: 'doc-1', clientId: 'client-a',
  });

  first.send({ type: 'text.preview', windowId: 'doc-1', text: 'hello remote' });
  await expect(second.next((event) => event.type === 'text.preview')).resolves.toMatchObject({
    windowId: 'doc-1', text: 'hello remote',
  });

  await expect(other.next((event) => ['cursor.move', 'typing', 'text.preview'].includes(event.type), 150))
    .rejects.toThrow(/timeout/);
});

test('invalid presence payloads are rejected with errors', async () => {
  const member = connect('workspace-a', 'member', '7');
  await member.opened;
  await member.next((event) => event.type === 'collaboration.ready');

  member.send({ type: 'cursor.move', x: Infinity, y: 0 });
  await expect(member.next((event) => event.type === 'error')).resolves.toMatchObject({
    reason: 'invalid-cursor',
  });

  member.send({ type: 'text.preview', windowId: 'doc-1', text: 'x'.repeat(9000) });
  await expect(member.next((event) => event.type === 'error')).resolves.toMatchObject({
    reason: 'text-preview-too-large',
  });
});
