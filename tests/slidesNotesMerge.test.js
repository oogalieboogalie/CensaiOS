import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

// Speaker notes merge letter by letter: Pat and Sam typing in the notes of
// the same slide at the same moment both keep their words.
const LOCAL = 'local';
const slide = (notes) => ({ layout: 'titleBody', blocks: [{ id: 't1', type: 'text', role: 'title', x: 6, y: 7, w: 88, h: 16, text: 'Made-up title' }], notes, at: 1 });
const board = (notes) => ({ wins: [{ id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, officeDeck: { order: ['s1'], theme: 'censai' }, 'os.s1': slide(notes) }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const notesOf = (doc, base) => readDocState(doc, base).wins[0]['os.s1'].notes;

test('two people typing in one slide\'s speaker notes keep both', () => {
  const { a, b, sync } = offlinePair();
  const base = board('Open with the demo. Thank the team.');
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  writeStateToDoc(a, base, board('Pat: Open with the demo. Thank the team.'), LOCAL);
  writeStateToDoc(b, base, board('Open with the demo. Thank the team. Sam: ask for questions.'), LOCAL);
  sync();
  for (const doc of [a, b]) expect(notesOf(doc, base)).toBe('Pat: Open with the demo. Thank the team. Sam: ask for questions.');
});

test('notes typed again after merging keep merging', () => {
  const { a, b, sync } = offlinePair();
  const base = board('');
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const one = board('Made-up note');
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board('Pat says hi. Made-up note'), LOCAL);
  writeStateToDoc(b, one, board('Made-up note. Sam says bye.'), LOCAL);
  sync();
  for (const doc of [a, b]) expect(notesOf(doc, base)).toBe('Pat says hi. Made-up note. Sam says bye.');
});

test('a slide box edit leaves the notes text alone', () => {
  const { a, b, sync } = offlinePair();
  const base = board('Made-up notes');
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const moved = board('Made-up notes');
  moved.wins[0]['os.s1'].blocks[0] = { ...moved.wins[0]['os.s1'].blocks[0], x: 40 };
  writeStateToDoc(a, base, moved, LOCAL);
  writeStateToDoc(b, base, board('Made-up notes, plus Sam'), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const s1 = readDocState(doc, base).wins[0]['os.s1'];
    expect([s1.blocks[0].x, s1.notes]).toEqual([40, 'Made-up notes, plus Sam']);
  }
});
