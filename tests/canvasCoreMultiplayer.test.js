// Canvas core, end to end over real sockets: two people on one board through
// a real Hocuspocus server with the Postgres update log (in-memory stand-in).
// The shared doc is the only board state: edits merge per field, presence
// rides awareness, and a fresh server rebuilds the board from the log alone.
import http from 'node:http';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { attachHocuspocusWs, createHocuspocusServer, HOCUSPOCUS_PATH } from '../server/collab/hocuspocus.js';
import { createYjsPersistence } from '../server/collab/yPersistence.js';
import { createYUpdateLog } from '../server/collab/yUpdateLog.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { presenceIdentity, readAwarenessPresence } from '../src/lib/collaboration/awarenessPresence.js';
import { yjsMemoryDb } from './support/yjsMemoryDb.js';
import { listBoardHistory, restoreBoard } from '../server/collab/boardHistory.js';
import { liveUpdateLog, registerLiveHocuspocus } from '../server/collab/liveDoc.js';

const WS = 'workspace-a';
const open = [];

function membershipDb() {
  return { query: async (_sql, [workspaceId]) => ({ rows: [{ id: workspaceId, name: workspaceId, role: 'member' }] }) };
}

async function startServer(db) {
  const updateLog = createYUpdateLog(db, { batchMs: 5 });
  const persistence = createYjsPersistence({ db, log: updateLog, ensureSchema: async () => {} });
  const hocuspocus = createHocuspocusServer({ persistence, redis: null, config: { debounce: 20, maxDebounce: 50, quiet: true } });
  const server = http.createServer();
  attachHocuspocusWs(server, {
    db: membershipDb(),
    authenticate: (request) => ({ userId: new URL(request.url, 'http://x').searchParams.get('user') }),
    hocuspocus,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const handle = { server, hocuspocus, updateLog };
  open.push(handle);
  return handle;
}

async function stopServer(handle) {
  const index = open.indexOf(handle);
  if (index >= 0) open.splice(index, 1);
  await handle.hocuspocus.closeConnections?.();
  await handle.updateLog.flush();
  await new Promise((resolve) => handle.server.close(resolve));
}

function join(handle, user) {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${handle.server.address().port}${HOCUSPOCUS_PATH}?workspaceId=${WS}&user=${user}`,
    name: WS,
    document: doc,
    WebSocketPolyfill: WebSocket,
  });
  const synced = new Promise((resolve) => provider.on('synced', resolve));
  const person = { doc, provider, synced, state: () => readDocState(doc) };
  handle.people = [...(handle.people || []), person];
  return person;
}

async function until(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    if (check()) return;
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the board to converge');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

function win(id, x, y, extra = {}) {
  return { id, kind: 'note', title: id, x, y, w: 320, h: 240, ...extra };
}

function edit(person, change) {
  const prev = person.state();
  writeStateToDoc(person.doc, prev, change(prev), 'test-local');
}

const byId = (state, id) => state.wins.find((w) => w.id === id);

afterEach(async () => {
  for (const handle of open.splice(0)) {
    for (const person of handle.people || []) person.provider.destroy();
    await new Promise((resolve) => handle.server.close(resolve));
  }
});

test('two people edit one board like a multiplayer game: nothing is lost, everyone converges', async () => {
  const db = yjsMemoryDb();
  const handle = await startServer(db);
  const alma = join(handle, 'alma');
  const sam = join(handle, 'sam');
  await Promise.all([alma.synced, sam.synced]);

  edit(alma, (s) => ({ ...s, wins: [win('w1', 0, 0), win('w2', 400, 0)] }));
  await until(() => sam.state().wins.length === 2);

  // Different windows and different fields of one window: every edit survives.
  edit(alma, (s) => ({ ...s, wins: s.wins.map((w) => (w.id === 'w1' ? { ...w, x: 50 } : w)) }));
  edit(sam, (s) => ({ ...s, wins: s.wins.map((w) => (w.id === 'w1' ? { ...w, h: 500 } : w.id === 'w2' ? { ...w, y: 90 } : w)) }));
  await until(() => byId(alma.state(), 'w1').h === 500 && byId(sam.state(), 'w1').x === 50);
  expect(byId(alma.state(), 'w2').y).toBe(90);

  // Same field at the same moment: one value wins, and both screens agree on it.
  edit(alma, (s) => ({ ...s, wins: s.wins.map((w) => (w.id === 'w2' ? { ...w, x: 111 } : w)) }));
  edit(sam, (s) => ({ ...s, wins: s.wins.map((w) => (w.id === 'w2' ? { ...w, x: 222 } : w)) }));
  await until(() => byId(alma.state(), 'w2').x === byId(sam.state(), 'w2').x);
  expect([111, 222]).toContain(byId(alma.state(), 'w2').x);

  // A close on one screen closes it everywhere; a new window shows up everywhere.
  edit(sam, (s) => ({ ...s, wins: [...s.wins.filter((w) => w.id !== 'w1'), win('w3', 800, 0)] }));
  await until(() => !byId(alma.state(), 'w1') && byId(alma.state(), 'w3'));

  await new Promise((resolve) => setTimeout(resolve, 150));
  await handle.updateLog.flush();
  expect(db.rows().length).toBeGreaterThan(0);
  const actors = new Set(db.rows().map((row) => row.actor));
  expect(actors).toEqual(new Set(['user:alma', 'user:sam']));
});

test('presence rides awareness: name, colour, cursor, selection and the window being dragged', async () => {
  const handle = await startServer(yjsMemoryDb());
  const alma = join(handle, 'alma');
  const sam = join(handle, 'sam');
  await Promise.all([alma.synced, sam.synced]);

  const identity = presenceIdentity({ id: 'alma', name: 'Alma' });
  alma.provider.awareness.setLocalStateField('user', identity);
  alma.provider.awareness.setLocalStateField('cursor', { x: 120, y: 80 });
  alma.provider.awareness.setLocalStateField('selection', ['w1']);
  alma.provider.awareness.setLocalStateField('drag', { windowId: 'w1', x: 30, y: 40 });

  const seen = () => readAwarenessPresence(sam.provider.awareness.getStates(), sam.provider.awareness.clientID);
  await until(() => Object.keys(seen().cursors).length === 1 && seen().previews.w1);
  const presence = seen();
  const [cursor] = Object.values(presence.cursors);
  expect(cursor).toMatchObject({ x: 120, y: 80, actor: { label: 'Alma', color: identity.color } });
  expect(presence.selections.w1).toMatchObject({ label: 'Alma', color: identity.color });
  expect(presence.previews.w1).toMatchObject({ x: 30, y: 40, actor: { label: 'Alma is moving this', outline: true } });
  expect(presence.participants.map((p) => p.actor.label)).toContain('Alma');

  alma.provider.destroy();
  await until(() => !seen().participants.some((p) => p.actor.label === 'Alma'));
});

test('a fresh server rebuilds the board from the update log alone, and a snapshot-only board migrates on first open', async () => {
  const db = yjsMemoryDb();
  db.setClientState({ value: { wins: [win('old-1', 10, 20)], canvasGroups: [], paths: [], links: [], dock: {} }, revision: 7 });

  const first = await startServer(db);
  const alma = join(first, 'alma');
  await alma.synced;
  expect(byId(alma.state(), 'old-1')).toMatchObject({ x: 10, y: 20 });
  expect(db.rows()[0].actor).toBe('migration');

  edit(alma, (s) => ({ ...s, wins: [...s.wins, win('new-1', 500, 500)] }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  alma.provider.destroy();
  first.people = [];
  await stopServer(first);
  // The backup copy was refreshed from the shared doc by the store hook.
  expect(db.clientState().value.wins.map((w) => w.id).sort()).toEqual(['new-1', 'old-1']);
  expect(db.clientState().revision).toBe(7);

  // The snapshot row is never read back as the board once the doc exists.
  db.setClientState({ value: { wins: [] }, revision: 8 });
  const second = await startServer(db);
  const sam = join(second, 'sam');
  await sam.synced;
  expect(sam.state().wins.map((w) => w.id).sort()).toEqual(['new-1', 'old-1']);
});

test('board history: everyone sees a roll-back at once, and the roll-back is a new step that keeps the past', async () => {
  const db = yjsMemoryDb();
  const handle = await startServer(db);
  registerLiveHocuspocus(handle.hocuspocus);
  try {
    expect(liveUpdateLog()).toBe(handle.updateLog);
    const alma = join(handle, 'alma');
    const sam = join(handle, 'sam');
    await Promise.all([alma.synced, sam.synced]);

    edit(alma, (s) => ({ ...s, wins: [win('notes', 0, 0)] }));
    await until(() => sam.state().wins.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await handle.updateLog.flush();
    const before = db.rows().at(-1).seq;

    edit(sam, (s) => ({ ...s, wins: [...s.wins, win('chat', 400, 0)] }));
    edit(sam, (s) => ({ ...s, wins: s.wins.map((w) => (w.id === 'notes' ? { ...w, x: 900 } : w)) }));
    await until(() => alma.state().wins.length === 2 && byId(alma.state(), 'notes').x === 900);

    // Every change has an entry naming who made it (newest first).
    const history = await listBoardHistory(db, WS, { updateLog: handle.updateLog, gapMs: 0 });
    expect(history.entries.at(-1)).toMatchObject({ who: { kind: 'user' }, change: { added: ['notes'] } });
    expect(history.entries.some((e) => e.change.added.includes('chat'))).toBe(true);

    await restoreBoard(WS, before, { actor: 'user:alma' });
    await until(() => sam.state().wins.length === 1 && byId(sam.state(), 'notes').x === 0);
    expect(alma.state().wins.map((w) => w.id)).toEqual(['notes']);

    await handle.updateLog.flush();
    const after = await listBoardHistory(db, WS, { updateLog: handle.updateLog, gapMs: 0 });
    expect(after.entries[0]).toMatchObject({ restoredTo: before, change: { removed: ['chat'], moved: 1 } });
    // The step before the roll-back is still there to go back to.
    const undo = after.entries[1];
    await restoreBoard(WS, undo.seq, { actor: 'user:sam' });
    await until(() => alma.state().wins.length === 2 && byId(alma.state(), 'notes').x === 900);
  } finally {
    registerLiveHocuspocus(null);
  }
});
