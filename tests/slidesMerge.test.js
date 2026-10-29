import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const LOCAL = 'local';
const box = (id, role, text, extra = {}) => ({ id, type: 'text', role, x: 6, y: 7, w: 88, h: 16, text, size: 18, align: 'left', bold: false, ...extra });
const slide = (title, body, extra = {}) => ({ layout: 'titleBody', blocks: [box('t1', 'title', title), box('b1', 'body', body)], notes: '', at: 1, ...extra });
const board = (slides) => ({
  wins: [{ id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, officeDeck: { order: Object.keys(slides), theme: 'censai' }, ...Object.fromEntries(Object.entries(slides).map(([id, s]) => [`os.${id}`, s])) }],
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

const winOf = (doc, base) => readDocState(doc, base).wins[0];
const textsOf = (doc, base, id) => winOf(doc, base)[`os.${id}`].blocks.map((b) => b.text);

describe('Slides merge one box at a time', () => {
  test('two people typing in different boxes of one slide keep both', () => {
    const { a, b, sync } = offlinePair();
    const base = board({ s1: slide('Made-up one', ''), s2: slide('', '') });
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, board({ s1: slide('Made-up one', ''), s2: slide('Made-up title', '') }), LOCAL);
    writeStateToDoc(b, base, board({ s1: slide('Made-up one', ''), s2: slide('', 'Made-up body') }), LOCAL);
    sync();
    for (const doc of [a, b]) expect(textsOf(doc, base, 's2')).toEqual(['Made-up title', 'Made-up body']);
  });

  test('a box moved by one person and retyped by another keeps both changes', () => {
    const { a, b, sync } = offlinePair();
    const base = board({ s1: slide('Made-up', '') });
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const moved = { ...slide('Made-up', ''), blocks: [box('t1', 'title', 'Made-up', { x: 30 }), box('b1', 'body', '')] };
    writeStateToDoc(a, base, board({ s1: moved }), LOCAL);
    writeStateToDoc(b, base, board({ s1: slide('Made-up new', '') }), LOCAL);
    sync();
    for (const doc of [a, b]) {
      const t1 = winOf(doc, base)['os.s1'].blocks[0];
      expect([t1.x, t1.text]).toEqual([30, 'Made-up new']);
    }
  });

  test('a slide removed while someone types on it stays removed', () => {
    const { a, b, sync } = offlinePair();
    const base = board({ s1: slide('Made-up one', ''), s2: slide('Made-up two', '') });
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const removed = board({ s1: slide('Made-up one', '') });
    removed.wins[0]['os.s2'] = null;
    removed.wins[0].officeDeck.order = ['s1'];
    writeStateToDoc(a, base, removed, LOCAL);
    writeStateToDoc(b, base, board({ s1: slide('Made-up one', ''), s2: slide('Made-up two', 'Made-up late words') }), LOCAL);
    sync();
    for (const doc of [a, b]) expect(winOf(doc, base)['os.s2']).toBeNull();
  });

  test('speaker notes and a new box sync with the slide', () => {
    const { a, b, sync } = offlinePair();
    const base = board({ s1: slide('Made-up', '') });
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const next = { ...slide('Made-up', '', { notes: 'Made-up notes' }) };
    next.blocks = [...next.blocks, box('p1', 'body', 'Made-up extra')];
    writeStateToDoc(a, base, board({ s1: next }), LOCAL);
    sync();
    const s1 = winOf(b, base)['os.s1'];
    expect([s1.notes, s1.blocks.length, s1.blocks[2].text]).toEqual(['Made-up notes', 3, 'Made-up extra']);
  });
});
