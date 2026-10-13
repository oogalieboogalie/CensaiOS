// Board history: the update log read as plain entries (who, when, what
// changed), the board at an earlier point, and rolling back to it.
import * as Y from 'yjs';
import { createYUpdateLog } from '../server/collab/yUpdateLog.js';
import { actorForChange } from '../server/collab/yPersistence.js';
import { boardAt, describeChange, listBoardHistory, parseActor, restoreBoard } from '../server/collab/boardHistory.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { describeHistoryEntry } from '../src/lib/collaboration/historyText.js';
import { yjsMemoryDb } from './support/yjsMemoryDb.js';

const MIN = 60 * 1000;

function win(id, x = 0, y = 0, extra = {}) {
  return { id, kind: 'note', title: id, x, y, w: 300, h: 200, ...extra };
}

function namedDb(db) {
  return {
    query: async (sql, params) => {
      if (sql.includes('FROM users')) return { rows: [{ id: 1, name: 'Alex' }, { id: 2, name: null, email: 'sam@example.com' }] };
      if (sql.includes('FROM share_link_joins')) return { rows: [{ guest_id: 'g1', display_name: 'Maria' }] };
      return db.query(sql, params);
    },
  };
}

async function board({ clock }) {
  const db = yjsMemoryDb({ now: () => clock.t });
  const updateLog = createYUpdateLog(db, { batchMs: 60_000, now: () => clock.t });
  const doc = new Y.Doc();
  let actor = 'user:1';
  doc.on('update', (update) => updateLog.append('ws-1', update, { actor }));
  const step = async (who, change, after = 0) => {
    clock.t += after;
    actor = who;
    const prev = readDocState(doc);
    writeStateToDoc(doc, prev, { ...prev, ...change(prev) });
    await updateLog.flush('ws-1');
  };
  return { db, updateLog, doc, step, setActor: (next) => { actor = next; } };
}

test('history groups each person\'s burst of changes and says what changed in plain words', async () => {
  const clock = { t: 1_000_000 };
  const { db, updateLog, step } = await board({ clock });
  await step('user:1', () => ({ wins: [win('Notes')] }));
  await step('user:1', (s) => ({ wins: [...s.wins, win('Chat', 400)] }), 10_000);
  await step('user:2', (s) => ({ wins: s.wins.map((w) => (w.id === 'Notes' ? { ...w, x: 50 } : w)) }), 10_000);
  await step('guest:g1', (s) => ({ paths: [{ id: 'p1', d: 'M0 0' }, { id: 'p2', d: 'M1 1' }] }), 10_000);
  await step('user:1', (s) => ({ wins: s.wins.filter((w) => w.id !== 'Chat') }), 5 * MIN);

  const history = await listBoardHistory(namedDb(db), 'ws-1', { updateLog });
  expect(history.latestSeq).toBe(5);
  expect(history.entries.map((e) => [e.who.name, e.steps, describeHistoryEntry(e)])).toEqual([
    ['Alex', 1, 'closed Chat'],
    ['Maria', 1, 'drew 2 strokes'],
    ['sam', 1, 'moved 1 window'],
    ['Alex', 2, 'added Notes and Chat'],
  ]);
  expect(history.entries[0].who.kind).toBe('user');
  expect(history.entries[1].who.kind).toBe('guest');
});

test('the board at an earlier point, and a roll-back that is itself a new step', async () => {
  const clock = { t: 0 };
  const { db, updateLog, doc, step, setActor } = await board({ clock });
  await step('user:1', () => ({ wins: [win('a', 0, 0, { text: 'hello' })] }));
  await step('user:2', (s) => ({ wins: [...s.wins.map((w) => ({ ...w, x: 99, text: 'hello world' })), win('b')] }));

  const then = await boardAt('ws-1', 1, { updateLog });
  expect(then.wins.map((w) => [w.id, w.x, w.text])).toEqual([['a', 0, 'hello']]);

  let context = null;
  const transact = async (_id, mutate, ctx) => {
    context = ctx;
    setActor(ctx.actor);
    mutate(doc);
    await updateLog.flush('ws-1');
    return true;
  };
  await expect(restoreBoard('ws-1', 1, { actor: 'user:1', updateLog, transact })).resolves.toEqual({ restoredTo: 1, windows: 1 });
  expect(context).toEqual({ actor: 'restore:1:user:1' });
  expect(readDocState(doc).wins.map((w) => [w.id, w.x, w.text])).toEqual([['a', 0, 'hello']]);

  const history = await listBoardHistory(namedDb(db), 'ws-1', { updateLog });
  expect(history.entries).toHaveLength(3);
  expect(history.entries[0]).toMatchObject({ restoredTo: 1 });
  expect(describeHistoryEntry(history.entries[0])).toBe('rolled the board back to an earlier point');
  // Rolling forward again returns everything.
  await restoreBoard('ws-1', 2, { actor: 'user:2', updateLog, transact });
  expect(readDocState(doc).wins.map((w) => w.id).sort()).toEqual(['a', 'b']);
});

test('a point already folded into the base cannot be opened, and nothing runs without the live server', async () => {
  const clock = { t: 0 };
  const { updateLog, step } = await board({ clock });
  await step('user:1', () => ({ wins: [win('a')] }));
  await step('user:1', (s) => ({ wins: [...s.wins, win('b')] }));
  await expect(boardAt('ws-1', 0, { updateLog: { rebuild: async () => null } })).rejects.toMatchObject({ statusCode: 410 });
  await expect(restoreBoard('ws-1', 1, { updateLog, transact: async () => false })).rejects.toMatchObject({ statusCode: 409 });
  await expect(listBoardHistory({}, 'ws-1')).rejects.toMatchObject({ statusCode: 409 });
});

test('who made a change is kept for members, guests, the server and roll-backs', () => {
  expect(actorForChange({ context: { guestId: 'g1' } })).toBe('guest:g1');
  expect(actorForChange({ context: { actor: 'restore:4:user:1', serverWriter: true } })).toBe('restore:4:user:1');
  expect(parseActor('restore:4:user:1')).toEqual({ kind: 'user', id: '1', restoredTo: 4 });
  expect(parseActor('migration')).toMatchObject({ kind: 'system' });
  expect(parseActor(null)).toMatchObject({ kind: 'unknown', name: 'Someone' });
});

test('raising a window is not an edit; text and title changes are', () => {
  const a = { wins: [win('a', 0, 0, { zIndex: 1 })] };
  expect(describeChange(a, { wins: [win('a', 0, 0, { zIndex: 9 })] })).toMatchObject({ moved: 0, edited: 0 });
  expect(describeChange(a, { wins: [win('a', 0, 0, { zIndex: 1, text: 'x' })] })).toMatchObject({ edited: 1 });
  expect(describeHistoryEntry({ change: { added: ['A', 'B', 'C', 'D'] } })).toBe('added A, B and 2 more');
});
