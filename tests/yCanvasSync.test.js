import * as Y from 'yjs';
import { isDocEmpty, readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const win = (id, x = 0, extra = {}) => ({ id, kind: 'note', x, y: 0, w: 200, h: 100, ...extra });
const LOCAL = 'local';

// Wire two docs together the way Hocuspocus relays updates between browsers.
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(b, u, 'remote'); });
  b.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(a, u, 'remote'); });
  return { a, b };
}

// Simulate both browsers editing while disconnected, then exchanging updates.
function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

describe('Yjs canvas sync', () => {
  test('a window opened in one browser appears in the other', () => {
    const { a, b } = pair();
    const start = { wins: [] };
    expect(isDocEmpty(b)).toBe(true);
    writeStateToDoc(a, start, { wins: [win('w1')] }, LOCAL);
    expect(readDocState(b, start).wins.map((w) => w.id)).toEqual(['w1']);
    expect(isDocEmpty(b)).toBe(false);
  });

  test('two browsers opening windows at the same moment both keep both', () => {
    const { a, b, sync } = offlinePair();
    const base = { wins: [win('shared')] };
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, { wins: [...base.wins, win('fromA')] }, LOCAL);
    writeStateToDoc(b, base, { wins: [...base.wins, win('fromB')] }, LOCAL);
    sync();
    const ids = (doc) => readDocState(doc, base).wins.map((w) => w.id).sort();
    expect(ids(a)).toEqual(['fromA', 'fromB', 'shared']);
    expect(ids(b)).toEqual(ids(a));
  });

  test('different fields of the same window merge; the same field converges to one value', () => {
    const { a, b, sync } = offlinePair();
    const base = { wins: [win('w1', 10, { title: 'Notes' })] };
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, { wins: [{ ...base.wins[0], x: 500 }] }, LOCAL);
    writeStateToDoc(b, base, { wins: [{ ...base.wins[0], title: 'Renamed' }] }, LOCAL);
    sync();
    for (const doc of [a, b]) {
      expect(readDocState(doc, base).wins[0]).toEqual(expect.objectContaining({ x: 500, title: 'Renamed' }));
    }
    // Same field, concurrent: both browsers land on the identical winner.
    const now = { wins: [readDocState(a, base).wins[0]] };
    writeStateToDoc(a, now, { wins: [{ ...now.wins[0], x: 1 }] }, LOCAL);
    writeStateToDoc(b, now, { wins: [{ ...now.wins[0], x: 2 }] }, LOCAL);
    sync();
    expect(readDocState(a, now).wins[0].x).toBe(readDocState(b, now).wins[0].x);
  });

  test('closing a window removes it everywhere', () => {
    const { a, b } = pair();
    const two = { wins: [win('w1'), win('w2')] };
    writeStateToDoc(a, null, two, LOCAL);
    writeStateToDoc(a, two, { wins: [two.wins[1]] }, LOCAL);
    expect(readDocState(b, two).wins.map((w) => w.id)).toEqual(['w2']);
  });

  test('concurrent ink strokes are both kept', () => {
    const { a, b, sync } = offlinePair();
    const base = { paths: [{ id: 'p0' }] };
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, { paths: [...base.paths, { id: 'pa' }] }, LOCAL);
    writeStateToDoc(b, base, { paths: [...base.paths, { id: 'pb' }] }, LOCAL);
    sync();
    const ids = (doc) => readDocState(doc, base).paths.map((p) => p.id).sort();
    expect(ids(a)).toEqual(['p0', 'pa', 'pb']);
    expect(ids(b)).toEqual(ids(a));
  });

  test('keeps local stacking order and object identity when nothing changed', () => {
    const { a } = pair();
    const state = { wins: [win('w2'), win('w1')], paths: [], links: [], canvasGroups: [], dock: {} };
    writeStateToDoc(a, null, state, LOCAL);
    const read = readDocState(a, state);
    expect(read.wins).toBe(state.wins);
    expect(read.paths).toBe(state.paths);
  });

  test('windows without valid geometry stay local-only and are not dropped', () => {
    const { a } = pair();
    const odd = { id: 'odd', kind: 'note' };
    const state = { wins: [odd] };
    writeStateToDoc(a, null, state, LOCAL);
    expect(isDocEmpty(a)).toBe(false);
    expect(readDocState(a, state).wins).toEqual([odd]);
  });
});

describe('Yjs canvas sync: shared windows, private views', () => {
  const doc = (id, text) => win(id, 0, { kind: 'doc', text });

  test('two people typing in the same doc at the same time both keep their words', () => {
    const { a, b, sync } = offlinePair();
    const base = { wins: [doc('d1', 'Hello world')] };
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, { wins: [doc('d1', 'Hello brave world')] }, LOCAL);
    writeStateToDoc(b, base, { wins: [doc('d1', 'Hello world, again')] }, LOCAL);
    sync();
    expect(readDocState(a, base).wins[0].text).toBe('Hello brave world, again');
    expect(readDocState(b, base).wins[0].text).toBe('Hello brave world, again');
  });

  test('code editor bodies merge the same way', () => {
    const { a, b, sync } = offlinePair();
    const code = (body) => win('c1', 0, { kind: 'code_editor', code: body });
    const base = { wins: [code('a();\nb();\n')] };
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, { wins: [code('first();\na();\nb();\n')] }, LOCAL);
    writeStateToDoc(b, base, { wins: [code('a();\nb();\nlast();\n')] }, LOCAL);
    sync();
    expect(readDocState(a, base).wins[0].code).toBe('first();\na();\nb();\nlast();\n');
    expect(readDocState(b, base).wins[0].code).toBe(readDocState(a, base).wins[0].code);
  });

  test('opening the editor in one browser does not open or close it in the other', () => {
    const { a, b } = pair();
    const base = { wins: [doc('d1', 'x')] };
    writeStateToDoc(a, null, base, LOCAL);
    const local = { wins: [{ ...base.wins[0], isEditing: false }] };
    writeStateToDoc(a, base, { wins: [{ ...base.wins[0], isEditing: true }] }, LOCAL);
    expect(readDocState(b, local).wins[0].isEditing).toBe(false);
    expect(readDocState(b, { wins: [] }).wins[0]).not.toHaveProperty('isEditing');
  });

  test('stacking order is shared through the window zIndex field', () => {
    const { a, b } = pair();
    const base = { wins: [win('w1', 0, { zIndex: 1 }), win('w2', 0, { zIndex: 2 })] };
    writeStateToDoc(a, null, base, LOCAL);
    writeStateToDoc(a, base, { wins: [{ ...base.wins[0], zIndex: 3 }, base.wins[1]] }, LOCAL);
    expect(readDocState(b, base).wins.find((w) => w.id === 'w1').zIndex).toBe(3);
  });
});
