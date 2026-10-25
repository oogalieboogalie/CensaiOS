// Canvas core: the update log (replay, rewind, compaction), the snapshot row
// reduced to a backup copy and a door in, Redis config, and the awareness
// presence mapping.
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { createYUpdateLog } from '../server/collab/yUpdateLog.js';
import { actorForChange, createYjsPersistence } from '../server/collab/yPersistence.js';
import { redisConfigFromEnv } from '../server/collab/hocuspocus.js';
import {
  canvasBackupFromDoc,
  mirrorSnapshotToCanvas,
  pickCanvasFields,
  withoutCanvasFields,
} from '../server/collab/canvasSnapshot.js';
import { snapshotToDoc } from '../server/collab/seedFromSnapshot.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  applyAwarenessPresence,
  presenceColor,
  presenceIdentity,
  readAwarenessPresence,
} from '../src/lib/collaboration/awarenessPresence.js';
import { yjsMemoryDb } from './support/yjsMemoryDb.js';

const HOUR = 60 * 60 * 1000;

function win(id, x, y) {
  return { id, kind: 'note', title: id, x, y, w: 300, h: 200 };
}

// One local doc whose every change goes into the log, flushed per step.
async function loggedBoard(updateLog) {
  const doc = new Y.Doc();
  doc.on('update', (update) => updateLog.append('ws-1', update, { actor: 'user:1' }));
  const step = async (wins) => {
    writeStateToDoc(doc, readDocState(doc), { ...readDocState(doc), wins });
    await updateLog.flush('ws-1');
  };
  return { doc, step };
}

const ids = (doc) => readDocState(doc).wins.map((w) => w.id).sort();

test('the board rewinds to any point still in the log', async () => {
  const db = yjsMemoryDb();
  const updateLog = createYUpdateLog(db, { batchMs: 60_000 });
  const { step } = await loggedBoard(updateLog);
  await step([win('a', 0, 0)]);
  await step([win('a', 0, 0), win('b', 10, 10)]);
  await step([win('b', 10, 10)]);

  expect(ids(await updateLog.rebuild('ws-1', { untilSeq: 1 }))).toEqual(['a']);
  expect(ids(await updateLog.rebuild('ws-1', { untilSeq: 2 }))).toEqual(['a', 'b']);
  expect(ids(await updateLog.rebuild('ws-1'))).toEqual(['b']);
  const loaded = await updateLog.load('ws-1');
  const doc = new Y.Doc();
  Y.applyUpdate(doc, loaded.update);
  expect(ids(doc)).toEqual(['b']);
  expect(loaded).toMatchObject({ rows: 3, lastSeq: 3 });
});

test('compaction folds only old rows; recent history stays replayable and the board is unchanged', async () => {
  let clock = 0;
  const now = () => clock;
  const db = yjsMemoryDb({ now });
  const updateLog = createYUpdateLog(db, { batchMs: 60_000, keepMs: HOUR, now });
  const { step } = await loggedBoard(updateLog);
  await step([win('a', 0, 0)]);
  await step([win('a', 5, 5)]);
  clock = 3 * HOUR;
  await step([win('a', 5, 5), win('c', 1, 1)]);

  const result = await updateLog.compact('ws-1');
  expect(result).toEqual({ folded: 2, compactedSeq: 2 });
  expect(db.rows().map((r) => r.seq)).toEqual([3]);
  expect(await updateLog.rebuild('ws-1', { untilSeq: 1 })).toBeNull();
  expect(ids(await updateLog.rebuild('ws-1', { untilSeq: 2 }))).toEqual(['a']);
  expect(ids(await updateLog.rebuild('ws-1'))).toEqual(['a', 'c']);
  expect(await updateLog.compact('ws-1')).toEqual({ folded: 0, compactedSeq: 2 });
});

test('compaction also caps the log at maxRows', async () => {
  const db = yjsMemoryDb();
  const updateLog = createYUpdateLog(db, { batchMs: 60_000, maxRows: 2 });
  const { step } = await loggedBoard(updateLog);
  for (let i = 0; i < 5; i += 1) await step([win('a', i, i)]);
  expect(await updateLog.compact('ws-1')).toEqual({ folded: 3, compactedSeq: 3 });
  expect(readDocState(await updateLog.rebuild('ws-1')).wins[0]).toMatchObject({ x: 4, y: 4 });
});

test('changes relayed from another server process through Redis are not logged twice', () => {
  const log = { append: jest.fn(), flush: jest.fn(), load: jest.fn(), compact: jest.fn() };
  const persistence = createYjsPersistence({ db: yjsMemoryDb(), log, ensureSchema: async () => {} });
  const update = Y.encodeStateAsUpdate(snapshotToDoc({ wins: [win('a', 0, 0)] }));
  persistence.onChange({ documentName: 'ws-1', update, transactionOrigin: { source: 'redis' } });
  expect(log.append).not.toHaveBeenCalled();
  persistence.onChange({ documentName: 'ws-1', update, context: { userId: 42 } });
  expect(log.append).toHaveBeenCalledWith('ws-1', update, { actor: 'user:42' });
  expect(actorForChange({ context: { serverWriter: true } })).toBe('server');
  expect(actorForChange({})).toBeNull();
});

test('the store hook refreshes the backup copy from the doc without bumping the revision', async () => {
  const db = yjsMemoryDb();
  db.setClientState({ value: { penColor: '#fff', wins: [] }, revision: 4 });
  const persistence = createYjsPersistence({ db, log: createYUpdateLog(db), ensureSchema: async () => {} });
  const doc = snapshotToDoc({ wins: [win('a', 1, 2)], paths: [{ id: 'p' }] });
  await persistence.onStoreDocument({ document: doc, documentName: 'ws-1' });
  expect(db.clientState()).toMatchObject({ revision: 4, value: { penColor: '#fff', wins: [{ id: 'a' }], paths: [{ id: 'p' }] } });
  expect(canvasBackupFromDoc(new Y.Doc())).toBeNull();
});

test('a whole-snapshot write reaches the doc limited to what it changed', async () => {
  const doc = snapshotToDoc({ wins: [win('a', 0, 0), win('b', 0, 0)], paths: [{ id: 'p1' }] });
  // Someone moved b live after the backup copy was written.
  writeStateToDoc(doc, readDocState(doc), {
    ...readDocState(doc), wins: readDocState(doc).wins.map((w) => (w.id === 'b' ? { ...w, x: 900 } : w)),
  });
  const transact = async (_id, mutate) => { mutate(doc); return true; };
  const backup = { wins: [win('a', 0, 0), win('b', 0, 0)], paths: [{ id: 'p1' }], penColor: 'red' };
  // A stale writer that only moved a (and knows nothing of the live move of b).
  const stale = { ...backup, wins: [win('a', 50, 60), win('b', 0, 0)] };
  await expect(mirrorSnapshotToCanvas('ws-1', backup, stale, { transact })).resolves.toBe(true);
  const state = readDocState(doc);
  expect(state.wins.find((w) => w.id === 'a')).toMatchObject({ x: 50, y: 60 });
  expect(state.wins.find((w) => w.id === 'b').x).toBe(900);
  expect(state.paths).toEqual([{ id: 'p1' }]);
  // No canvas fields: nothing to mirror.
  await expect(mirrorSnapshotToCanvas('ws-1', backup, { penColor: 'blue' }, { transact })).resolves.toBe(false);
  // A restore onto a board with no snapshot never duplicates ink the doc already has.
  await mirrorSnapshotToCanvas('ws-1', null, { paths: [{ id: 'p1' }] }, { transact });
  expect(readDocState(doc).paths).toEqual([{ id: 'p1' }]);
});

test('settings saves strip the canvas fields', () => {
  const value = { wins: [1], canvasGroups: [], paths: [], links: [], dock: {}, penColor: 'red', sidebarFavorites: ['x'] };
  expect(withoutCanvasFields(value)).toEqual({ penColor: 'red', sidebarFavorites: ['x'] });
  expect(Object.keys(pickCanvasFields(value)).sort()).toEqual(['canvasGroups', 'dock', 'links', 'paths', 'wins']);
  expect(withoutCanvasFields(null)).toEqual({});
});

test('Redis is opt-in through REDIS_URL', () => {
  expect(redisConfigFromEnv({})).toBeNull();
  expect(redisConfigFromEnv({ REDIS_URL: 'http://nope' })).toBeNull();
  expect(redisConfigFromEnv({ REDIS_URL: 'redis://:secret@cache:6380/2' })).toEqual({
    host: 'cache', port: 6380, prefix: 'censai-canvas', options: { password: 'secret', db: 2 },
  });
  expect(redisConfigFromEnv({ REDIS_URL: 'rediss://cache' }).options).toEqual({ tls: {} });
});

test('awareness states map to cursors, selections, drags and typing for everyone but me', () => {
  const alma = presenceIdentity({ id: 7, email: 'alma@censai.app' });
  expect(alma).toEqual({ id: '7', name: 'alma', color: presenceColor('7') });
  const states = new Map([
    [1, { user: { id: 'me', name: 'Me' }, cursor: { x: 1, y: 1 } }],
    [2, { user: alma, cursor: { x: 10, y: 20 }, selection: ['w1', 'bad id!'], drag: { windowId: 'w2', x: 5, y: 6 }, typing: 'w3' }],
    [3, { cursor: { x: 0, y: 0 } }],
    [4, { user: { id: 's', name: 'Sam' }, cursor: { x: Infinity, y: 0 } }],
  ]);
  const presence = readAwarenessPresence(states, 1);
  expect(presence.participants.map((p) => [p.actor.label, p.self])).toEqual([['Me', true], ['alma', false], ['Sam', false]]);
  expect(Object.keys(presence.cursors)).toEqual(['2']);
  expect(Object.keys(presence.selections)).toEqual(['w1']);
  expect(presence.typing.w3.actor.label).toBe('alma');

  const wins = [win('w1', 0, 0), win('w2', 0, 0), win('w3', 0, 0)];
  const shown = applyAwarenessPresence(wins, presence);
  expect(shown[0].selectionActor).toMatchObject({ label: 'alma', outline: true, color: alma.color });
  expect(shown[1]).toMatchObject({ x: 5, y: 6, collaborationActor: { label: 'alma is moving this', outline: true } });
  expect(shown[2].typingActor).toMatchObject({ label: 'alma typing…', shared: true });
});

test('two people dropping the same window at once: one whole drop wins, never x from one and y from the other', () => {
  for (let round = 0; round < 20; round += 1) {
    const base = snapshotToDoc({ wins: [win('w', 0, 0)] });
    const alma = new Y.Doc();
    const sam = new Y.Doc();
    Y.applyUpdate(alma, Y.encodeStateAsUpdate(base));
    Y.applyUpdate(sam, Y.encodeStateAsUpdate(base));
    const drop = (doc, x, y) => {
      const prev = readDocState(doc);
      writeStateToDoc(doc, prev, { ...prev, wins: prev.wins.map((w) => ({ ...w, x, y })) });
    };
    drop(alma, 100, 0); // Alma only moved sideways
    drop(sam, 0, 200); // Sam only moved down
    Y.applyUpdate(alma, Y.encodeStateAsUpdate(sam));
    Y.applyUpdate(sam, Y.encodeStateAsUpdate(alma));
    const a = readDocState(alma).wins[0];
    expect(readDocState(sam).wins[0]).toMatchObject({ x: a.x, y: a.y });
    expect([[100, 0], [0, 200]]).toContainEqual([a.x, a.y]);
  }
});
