import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

// The words inside a slide's text box merge letter by letter: Pat and Sam
// typing in the same box at the same moment both keep their words.
const LOCAL = 'local';
const title = (text, extra = {}) => ({ id: 't1', type: 'text', role: 'title', x: 6, y: 7, w: 88, h: 16, text, ...extra });
const slide = (blocks) => ({ layout: 'titleBody', blocks, notes: '', at: 1 });
const board = (blocks) => ({ wins: [{ id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, officeDeck: { order: ['s1'], theme: 'censai' }, 'os.s1': slide(blocks) }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const boxesOf = (doc, base) => readDocState(doc, base).wins[0]['os.s1'].blocks;

test('two people typing in one slide box keep both their words', () => {
  const { a, b, sync } = offlinePair();
  const base = board([title('Made-up launch plan')]);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  writeStateToDoc(a, base, board([title('Pat: Made-up launch plan')]), LOCAL);
  writeStateToDoc(b, base, board([title('Made-up launch plan for spring')]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(boxesOf(doc, base)[0].text).toBe('Pat: Made-up launch plan for spring');
});

test('a box saved as plain words still merges after its first edit', () => {
  const { a, b, sync } = offlinePair();
  const base = board([title('Old words')]);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const one = board([title('Old words, edited')]);
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board([title('Pat. Old words, edited')]), LOCAL);
  writeStateToDoc(b, one, board([title('Old words, edited. Sam.')]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(boxesOf(doc, base)[0].text).toBe('Pat. Old words, edited. Sam.');
});

test('a new box added while someone types keeps merging too', () => {
  const { a, b, sync } = offlinePair();
  const base = board([title('Title')]);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const added = board([title('Title'), { id: 't2', type: 'text', x: 10, y: 40, w: 60, h: 30, text: 'Body' }]);
  writeStateToDoc(a, base, added, LOCAL);
  sync();
  writeStateToDoc(a, added, board([title('Title'), { ...added.wins[0]['os.s1'].blocks[1], text: 'Pat Body' }]), LOCAL);
  writeStateToDoc(b, added, board([title('Title'), { ...added.wins[0]['os.s1'].blocks[1], text: 'Body Sam' }]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(boxesOf(doc, base)[1].text).toBe('Pat Body Sam');
});

test('moving a box while someone types in it keeps both', () => {
  const { a, b, sync } = offlinePair();
  const base = board([title('Made-up title')]);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  writeStateToDoc(a, base, board([title('Made-up title', { x: 30 })]), LOCAL);
  writeStateToDoc(b, base, board([title('Made-up title, by Sam')]), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const [box] = boxesOf(doc, base);
    expect([box.x, box.text]).toEqual([30, 'Made-up title, by Sam']);
  }
});
