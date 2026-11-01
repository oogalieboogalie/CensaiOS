import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { askEntry, asksNewestFirst, withAsk, MAX_ASKS, MAX_QUESTION } from '../src/lib/research/researchAsks.js';

const LOCAL = 'local';
const board = (win) => ({ wins: [{ id: 'r1', kind: 'research', x: 0, y: 0, w: 760, h: 620, ...win }] });
const answer = { answer: 'Made-up answer.', sources: [{ n: 1, title: 'Made-up notes', url: null }] };

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

test('two people asking Research at the same moment both keep their question', () => {
  const { a, b, sync } = offlinePair();
  const first = askEntry({ question: 'Made-up first question', answer, by: 'Pat Example' });
  const base = board(withAsk({}, first));
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const win = base.wins[0];
  writeStateToDoc(a, base, board({ ...win, ...withAsk(win, askEntry({ question: 'Made-up same question', answer, by: 'Pat Example' })) }), LOCAL);
  writeStateToDoc(b, base, board({ ...win, ...withAsk(win, askEntry({ question: 'Made-up same question', answer, by: 'Sam Example' })) }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const asks = asksNewestFirst(readDocState(doc, base).wins[0]);
    expect(asks.map((x) => x.by).sort()).toEqual(['Pat Example', 'Pat Example', 'Sam Example']);
    expect(asks[asks.length - 1].question).toBe('Made-up first question');
  }
});

test('a window saved before keeps its questions when the next one is asked', () => {
  const old = { research: { asks: [{ id: 'ask-2', question: 'Made-up newer' }, { id: 'ask-1', question: 'Made-up older' }] } };
  expect(asksNewestFirst(old).map((x) => x.question)).toEqual(['Made-up newer', 'Made-up older']);
  const next = { ...old, ...withAsk(old, askEntry({ question: 'Made-up newest', answer })) };
  expect(asksNewestFirst(next).map((x) => x.question)).toEqual(['Made-up newest', 'Made-up newer', 'Made-up older']);
});

test('the board keeps the newest questions and a short copy of a long one', () => {
  let win = {};
  for (let i = 0; i < MAX_ASKS + 3; i += 1) win = { ...win, ...withAsk(win, askEntry({ question: `Made-up ${i}`, answer })) };
  expect(asksNewestFirst(win)).toHaveLength(MAX_ASKS);
  expect(asksNewestFirst(win)[0].question).toBe(`Made-up ${MAX_ASKS + 2}`);
  expect(askEntry({ question: 'x'.repeat(20000), answer }).question).toHaveLength(MAX_QUESTION);
});
