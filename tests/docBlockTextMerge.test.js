import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

// The words of a Writer paragraph merge letter by letter: Pat and Sam typing
// in the same paragraph at the same moment both keep their words.
const LOCAL = 'local';
const para = (text, extra = {}) => ({ type: 'p', text, at: 1, ...extra });
const board = (blocks) => ({ wins: [{ id: 'd1', kind: 'officeDocs', x: 0, y: 0, w: 800, h: 600, officeDoc: { order: Object.keys(blocks) }, ...Object.fromEntries(Object.entries(blocks).map(([id, b]) => [`ob.${id}`, b])) }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const blockOf = (doc, base, id = 'b1') => readDocState(doc, base).wins[0][`ob.${id}`];

test('two people typing in one paragraph keep both their words', () => {
  const { a, b, sync } = offlinePair();
  const base = board({ b1: para('Made-up plan for the bake sale') });
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  writeStateToDoc(a, base, board({ b1: para('Pat: Made-up plan for the bake sale') }), LOCAL);
  writeStateToDoc(b, base, board({ b1: para('Made-up plan for the bake sale on Friday') }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).text).toBe('Pat: Made-up plan for the bake sale on Friday');
});

test('a paragraph saved as plain words still merges after its first edit', () => {
  const { a, b, sync } = offlinePair();
  const base = board({ b1: para('Old words') });
  writeStateToDoc(a, null, base, LOCAL);
  // An older board saved the paragraph as one plain value.
  a.getMap('canvas').get('windows').get('d1').set('ob.b1', new Y.Map(Object.entries(para('Old words'))));
  sync();
  const one = board({ b1: para('Old words, edited') });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ b1: para('Pat. Old words, edited') }), LOCAL);
  writeStateToDoc(b, one, board({ b1: para('Old words, edited. Sam.') }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).text).toBe('Pat. Old words, edited. Sam.');
});

test('turning a paragraph into a heading while someone types in it keeps both', () => {
  const { a, b, sync } = offlinePair();
  const base = board({ b1: para('Made-up title') });
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  writeStateToDoc(a, base, board({ b1: para('Made-up title', { type: 'h1' }) }), LOCAL);
  writeStateToDoc(b, base, board({ b1: para('Made-up title, by Sam') }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const block = blockOf(doc, base);
    expect([block.type, block.text]).toEqual(['h1', 'Made-up title, by Sam']);
  }
});

test('a removed paragraph stays removed, and a table still saves whole', () => {
  const { a, b, sync } = offlinePair();
  const table = { type: 'table', rows: [['Made-up', 'cells']], at: 2 };
  const base = board({ b1: para('Goes away'), b2: table });
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  const next = board({ b1: null, b2: { ...table, rows: [['Made-up', 'cells', 'more']] } });
  writeStateToDoc(a, base, next, LOCAL);
  sync();
  expect(blockOf(b, base)).toBeNull();
  expect(blockOf(b, base, 'b2').rows).toEqual([['Made-up', 'cells', 'more']]);
});
