import http from 'node:http';
import { WebSocket } from 'ws';
import {
  attachWorkspaceCollaborationWs,
  WORKSPACE_COLLABORATION_PATH,
} from '../server/ws/workspaceCollaboration.js';
import {
  __resetWorkspaceHubForTests,
  publishWorkspaceEvent,
} from '../server/collaboration/workspaceHub.js';
import { capabilitiesForRole } from '../server/shareLinks/access.js';
import { guestActor } from '../server/shareLinks/guestSession.js';
import { __resetLiveGuestsForTests, disconnectShareLink } from '../server/shareLinks/liveGuests.js';
import { __resetProjectorsForTests, configureProjector } from '../server/shareLinks/projector.js';

let server;
const sockets = [];

function guestAccessFor(url) {
  const role = url.searchParams.get('role') || 'comment';
  const mode = url.searchParams.get('mode') || 'link';
  const link = {
    id: url.searchParams.get('link') || 'link-1', workspace_id: 'board-a', workspace_name: 'Board',
    role, mode, scope_kind: 'board', scope_id: null, stage: false, expires_at: null,
  };
  const guest = { guestId: `guest-${url.searchParams.get('clientId')}`, name: url.searchParams.get('name') || 'Maria', color: '#4f7cac' };
  return {
    guest, link, capabilities: capabilitiesForRole(role), actor: guestActor(guest, link),
    workspace: { id: 'board-a', name: 'Board', role: role === 'edit' ? 'member' : 'viewer' },
  };
}

function connect(query) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${WORKSPACE_COLLABORATION_PATH}?workspaceId=board-a&${query}`);
  sockets.push(ws);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(({ predicate }) => predicate(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else queue.push(message);
  });
  const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
  const opened = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const next = (predicate = () => true, timeoutMs = 1500) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter);
        if (current >= 0) waiters.splice(current, 1);
        reject(new Error('timeout'));
      }, timeoutMs);
    });
  };
  const seen = (type) => queue.some((message) => message.type === type);
  return { ws, opened, closed, next, seen, send: (value) => ws.send(JSON.stringify(value)) };
}

beforeEach(async () => {
  __resetWorkspaceHubForTests();
  __resetLiveGuestsForTests();
  __resetProjectorsForTests();
  configureProjector({
    reader: async () => null,
    fallback: async () => ({
      wins: [
        { id: 'brief', kind: 'doc', x: 0, y: 0, w: 10, h: 10 },
        { id: 'shell', kind: 'terminal', x: 0, y: 0, w: 10, h: 10 },
      ],
      canvasGroups: [], paths: [], links: [],
    }),
  });
  server = http.createServer();
  attachWorkspaceCollaborationWs(server, {
    db: { query: async (_sql, [workspaceId]) => ({ rows: [{ id: workspaceId, name: workspaceId, role: 'owner' }] }) },
    authenticate: async () => ({ userId: '7', userEmail: 'alex@example.com' }),
    authenticateGuest: async (request) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.searchParams.get('deny')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return guestAccessFor(url);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    try { socket.terminate(); } catch { /* closed */ }
  }
  __resetProjectorsForTests();
  await new Promise((resolve) => server.close(resolve));
});

test('a commenter gets a filtered board, presence and cursors, but cannot move windows', async () => {
  const owner = connect('clientId=owner-1');
  await owner.opened;
  await owner.next((m) => m.type === 'collaboration.ready');
  const guest = connect('clientId=g1&guest=1&role=comment&name=Maria');
  await guest.opened;
  const ready = await guest.next((m) => m.type === 'collaboration.ready');
  expect(ready.guest).toMatchObject({ role: 'comment', projected: true });
  const board = await guest.next((m) => m.type === 'guest.board');
  expect(board.board.wins.map((win) => win.id)).toEqual(['brief']);

  const presence = await owner.next((m) => m.type === 'presence.snapshot' && m.participants.length === 2);
  expect(presence.participants.find((p) => p.actor.type === 'guest').actor).toMatchObject({ label: 'Maria', color: '#4f7cac' });

  guest.send({ type: 'cursor.move', x: 10, y: 20 });
  expect(await owner.next((m) => m.type === 'cursor.move')).toMatchObject({ x: 10, y: 20, actor: { label: 'Maria' } });

  guest.send({ type: 'window.preview', windowId: 'brief', x: 5, y: 5 });
  expect(await guest.next((m) => m.type === 'error')).toMatchObject({ reason: 'read-only-guest' });
  guest.send({ type: 'camera', x: 0, y: 0, zoom: 1 });
  expect(await guest.next((m) => m.type === 'error')).toMatchObject({ reason: 'read-only-guest' });
});

test('board events reach guests only when published for them', async () => {
  const guest = connect('clientId=g1&guest=1&role=comment');
  await guest.opened;
  await guest.next((m) => m.type === 'collaboration.ready');
  publishWorkspaceEvent('board-a', { type: 'workspace.committed', revision: 2, value: { wins: [{ id: 'shell' }] } });
  publishWorkspaceEvent('board-a', { type: 'share.links.changed' }, { guests: true });
  await guest.next((m) => m.type === 'share.links.changed');
  expect(guest.seen('workspace.committed')).toBe(false);
});

test('an edit guest can move windows and receives live edits', async () => {
  const owner = connect('clientId=owner-1');
  await owner.opened;
  await owner.next((m) => m.type === 'collaboration.ready');
  const editor = connect('clientId=g2&guest=1&role=edit');
  await editor.opened;
  const ready = await editor.next((m) => m.type === 'collaboration.ready');
  expect(ready.guest.projected).toBe(false);
  editor.send({ type: 'window.preview', windowId: 'brief', x: 5, y: 5 });
  expect(await owner.next((m) => m.type === 'window.preview')).toMatchObject({ windowId: 'brief' });
  owner.send({ type: 'text.preview', windowId: 'brief', text: 'draft' });
  expect(await editor.next((m) => m.type === 'text.preview')).toMatchObject({ text: 'draft' });
});

test('spectators follow the host camera, react, and are counted instead of listed', async () => {
  const owner = connect('clientId=owner-1');
  await owner.opened;
  await owner.next((m) => m.type === 'collaboration.ready');
  const viewer = connect('clientId=s1&guest=1&role=view&mode=live&link=live-1');
  await viewer.opened;
  await viewer.next((m) => m.type === 'collaboration.ready');
  const presence = await owner.next((m) => m.type === 'presence.snapshot' && m.spectators === 1);
  expect(presence.participants).toHaveLength(1);

  owner.send({ type: 'camera', x: -40, y: 12, zoom: 1.5, width: 1440, height: 900 });
  expect(await viewer.next((m) => m.type === 'camera')).toMatchObject({ x: -40, zoom: 1.5 });
  viewer.send({ type: 'reaction', reaction: 'clap' });
  expect(await owner.next((m) => m.type === 'reaction')).toMatchObject({ reaction: 'clap' });
  viewer.send({ type: 'reaction', reaction: '<script>' });
  expect(await viewer.next((m) => m.type === 'error')).toMatchObject({ reason: 'invalid-reaction' });
  viewer.send({ type: 'hand', raised: true });
  expect(await owner.next((m) => m.type === 'hand')).toMatchObject({ raised: true });
  owner.send({ type: 'cursor.move', x: 1, y: 1 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(viewer.seen('cursor.move')).toBe(false);
});

test('revoking a link closes its guests at once', async () => {
  const guest = connect('clientId=g1&guest=1&role=comment&link=link-9');
  await guest.opened;
  await guest.next((m) => m.type === 'collaboration.ready');
  expect(disconnectShareLink('link-9')).toBeGreaterThan(0);
  expect(await guest.closed).toBe(4403);
});

test('a dead guest pass is refused at the upgrade', async () => {
  const guest = connect('clientId=g1&guest=1&deny=1');
  await expect(guest.opened).rejects.toThrow(/403/);
});
