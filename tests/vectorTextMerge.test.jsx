/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { readVector } from '../src/lib/creative/vectorModel.js';
import { VectorPanel } from '../src/components/creative/vector/VectorPanel.jsx';

// A Censai Vector text box merges letter by letter: Pat and Sam typing in one
// at the same moment both keep their words, and one person typing while the
// other drags or recolours it keeps both changes. Before, the whole shape was
// one value, so the last person to touch it wiped the other's change. All
// words are made up.
const LOCAL = 'local';
const SHAPE = { type: 'text', x: 80, y: 120, fill: 'ink', stroke: 'none', sw: 0, opacity: 1, size: 48, weight: 600, text: 'Bake sale', at: 1 };
const RECT = { type: 'rect', x: 10, y: 10, w: 100, h: 60, fill: 'accent', stroke: 'none', sw: 2, opacity: 1, at: 2 };
const board = (shape, extra = {}) => ({
  wins: [{ id: 'v1', kind: 'creativeVector', x: 0, y: 0, w: 800, h: 600, vectorDoc: { w: 1200, h: 800, bg: 'white', order: ['s1'] }, 'vs.s1': shape, ...extra }],
});

function startBoth(base) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync };
}

const shapeOf = (doc, base, id = 's1') => readVector(readDocState(doc, base).wins[0]).shapes[id];

afterEach(cleanup);

test('Pat and Sam typing in one text box keep both their words', () => {
  const base = board(SHAPE);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board({ ...SHAPE, text: 'Big bake sale' }), LOCAL);
  writeStateToDoc(b, base, board({ ...SHAPE, text: 'Bake sale Saturday' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(shapeOf(doc, base).text).toBe('Big bake sale Saturday');
});

test('Pat types while Sam drags and recolours the text box; all three stay', () => {
  const base = board(SHAPE);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board({ ...SHAPE, text: 'Bake sale!' }), LOCAL);
  writeStateToDoc(b, base, board({ ...SHAPE, x: 300, fill: 'accent' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const s = shapeOf(doc, base);
    expect([s.text, s.x, s.fill, s.type]).toEqual(['Bake sale!', 300, 'accent', 'text']);
  }
});

test('a shape with no words (a rectangle) still moves and recolours whole', () => {
  const base = board(SHAPE, { 'vs.r1': RECT, vectorDoc: { w: 1200, h: 800, bg: 'white', order: ['s1', 'r1'] } });
  const { a, b, sync } = startBoth(base);
  const next = board(SHAPE, { 'vs.r1': { ...RECT, x: 200, fill: 'ink' }, vectorDoc: base.wins[0].vectorDoc });
  writeStateToDoc(a, base, next, LOCAL);
  sync();
  expect(shapeOf(b, base, 'r1')).toEqual({ ...RECT, x: 200, fill: 'ink' });
});

test('a removed text box stays removed on both screens', () => {
  const base = board(SHAPE);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, { wins: [{ ...board(null).wins[0], vectorDoc: { w: 1200, h: 800, bg: 'white', order: [] } }] }, LOCAL);
  sync();
  expect(shapeOf(b, base)).toBeUndefined();
});

test('a text box saved whole by an older board still merges after its first edit', () => {
  const base = board(SHAPE);
  const { a, b, sync } = startBoth(base);
  // An older board saved the shape as one plain map, its words plain text.
  a.getMap('canvas').get('windows').get('v1').set('vs.s1', new Y.Map(Object.entries(SHAPE)));
  sync();
  const one = board({ ...SHAPE, text: 'Bake sale, Saturday' });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ ...SHAPE, text: 'Pat: Bake sale, Saturday' }), LOCAL);
  writeStateToDoc(b, one, board({ ...SHAPE, text: 'Bake sale, Saturday. Sam' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(shapeOf(doc, base).text).toBe('Pat: Bake sale, Saturday. Sam');
});

test("a teammate's letters show in the text box and keep your cursor in place", () => {
  const panel = (text) => {
    const shape = { ...SHAPE, text };
    const v = { doc: { order: ['s1'], shapes: { s1: shape } }, one: shape, style: shape, selected: ['s1'], setStyleField: () => {}, select: () => {} };
    return <VectorPanel v={v} />;
  };
  const { rerender } = render(panel('Bake sale'));
  const box = screen.getByLabelText('Text', { selector: 'textarea' });
  act(() => { box.focus(); box.setSelectionRange(4, 4); });
  rerender(panel('Big Bake sale'));
  expect(box.value).toBe('Big Bake sale');
  expect(box.value.slice(0, box.selectionStart)).toBe('Big Bake');
});
