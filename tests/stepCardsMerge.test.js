import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const LOCAL = 'local';
const card = (id, title, extra = {}) => ({ id, title, assignee: null, steps: [{ id: `${id}-s1`, title: 'Made-up step', done: false }], ...extra });
const board = (cards) => ({ wins: [{ id: 'sc1', kind: 'stepCards', x: 0, y: 0, w: 960, h: 620, cards }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const cardsOf = (doc, base) => readDocState(doc, base).wins[0].cards;

describe('Step cards merge one card at a time', () => {
  test('a card removed while someone checks it stays removed on both screens', () => {
    const { a, b, sync } = offlinePair();
    const base = board([card('c1', 'Made-up paint'), card('c2', 'Made-up shelf')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, board([card('c1', 'Made-up paint')]), LOCAL);
    const checking = card('c2', 'Made-up shelf', { steps: [{ id: 'c2-s1', title: 'Made-up step', done: false, checking: true }] });
    writeStateToDoc(b, base, board([card('c1', 'Made-up paint'), checking]), LOCAL);
    sync();
    for (const doc of [a, b]) expect(cardsOf(doc, base).map((c) => c.id)).toEqual(['c1']);
  });

  test('two people changing different cards at once keep both changes', () => {
    const { a, b, sync } = offlinePair();
    const base = board([card('c1', 'Made-up paint'), card('c2', 'Made-up shelf')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, board([card('c1', 'Made-up paint', { assignee: 'atlas' }), card('c2', 'Made-up shelf')]), LOCAL);
    writeStateToDoc(b, base, board([card('c1', 'Made-up paint'), card('c2', 'Made-up shelf', { assignee: 'user:2' })]), LOCAL);
    sync();
    for (const doc of [a, b]) {
      expect(cardsOf(doc, base).map((c) => c.assignee)).toEqual(['atlas', 'user:2']);
    }
  });

  test('a field taken off a card is gone after the merge', () => {
    const { a, b, sync } = offlinePair();
    const base = board([card('c1', 'Made-up paint', { cliTaskId: 'task-1' })]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const { cliTaskId, ...rest } = base.wins[0].cards[0];
    writeStateToDoc(a, base, board([rest]), LOCAL);
    sync();
    expect(cardsOf(b, base)[0]).not.toHaveProperty('cliTaskId');
  });
});
