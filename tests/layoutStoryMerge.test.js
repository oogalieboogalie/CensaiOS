import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { readLayout } from '../src/lib/yorware/layoutModel.js';

// A YorWare Layout story's words merge letter by letter: Pat and Sam typing
// in one flyer's text frame at the same moment both keep what they typed,
// while its font and colour are still picked whole. All words are made up.
const LOCAL = 'local';
const STORY = { text: 'Bake sale on Saturday', font: 'sans', size: 12, color: 'ink', frames: ['f1'] };
const FRAME = { page: 'p1', type: 'text', x: 36, y: 36, w: 200, h: 100, story: 's1' };
const board = (story, extra = {}) => ({
  wins: [{
    id: 'y1', kind: 'yorLayout', x: 0, y: 0, w: 800, h: 600,
    layDoc: { size: 'letter', w: 612, h: 792, margin: 36, order: ['p1'] },
    'lpg.p1': { at: 1 }, 'lfr.f1': FRAME, 'lst.s1': story, ...extra,
  }],
});

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const storyOf = (doc, base) => readLayout(readDocState(doc, base).wins[0]).stories.s1;

function startBoth(story = STORY) {
  const pair = offlinePair();
  const base = board(story);
  writeStateToDoc(pair.a, null, base, LOCAL);
  pair.sync();
  return { ...pair, base };
}

test('Pat and Sam typing in one story keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...STORY, text: 'Big bake sale on Saturday' }), LOCAL);
  writeStateToDoc(b, base, board({ ...STORY, text: 'Bake sale on Saturday at noon' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(storyOf(doc, base).text).toBe('Big bake sale on Saturday at noon');
});

test('Pat types while Sam changes the font: both stay, the font is picked whole', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...STORY, text: 'Bake sale on Saturday!' }), LOCAL);
  writeStateToDoc(b, base, board({ ...STORY, font: 'serif' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const s = storyOf(doc, base);
    expect([s.text, s.font, s.frames]).toEqual(['Bake sale on Saturday!', 'serif', ['f1']]);
  }
});

test('two people picking a font at once end on one real font, never a mix', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...STORY, font: 'serif' }), LOCAL);
  writeStateToDoc(b, base, board({ ...STORY, font: 'mono' }), LOCAL);
  sync();
  const [fa, fb] = [a, b].map((doc) => storyOf(doc, base).font);
  expect(fa).toBe(fb);
  expect(['serif', 'mono']).toContain(fa);
});

test('a story saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  // An older board saved the story as one plain map, its words plain text.
  a.getMap('canvas').get('windows').get('y1').set('lst.s1', new Y.Map(Object.entries({ ...STORY, frames: undefined }).filter(([, v]) => v !== undefined)));
  sync();
  const plain = { ...STORY };
  delete plain.frames;
  const one = board({ ...plain, text: 'Bake sale, Saturday' });
  writeStateToDoc(a, board(plain), one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ ...plain, text: 'Pat: Bake sale, Saturday' }), LOCAL);
  writeStateToDoc(b, one, board({ ...plain, text: 'Bake sale, Saturday. Sam' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(storyOf(doc, base).text).toBe('Pat: Bake sale, Saturday. Sam');
});

test('a removed story stays removed on both screens', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board(null, { 'lfr.f1': null }), LOCAL);
  sync();
  expect(storyOf(b, base)).toBeUndefined();
});
