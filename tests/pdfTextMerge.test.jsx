/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { readPdf, textBox } from '../src/lib/yorware/pdfModel.js';
import { PdfMark } from '../src/components/yorware/pdf/PdfMark.jsx';

// A text box placed on a YorWare PDF page merges letter by letter: Pat and Sam
// typing in one at the same moment both keep their words, and one person
// typing while the other drags it keeps both changes. Before, the whole mark
// was one value, so the last person to touch it wiped the other's change.
// All words are made up.
const LOCAL = 'local';
const MARK = { page: 'p1', type: 'text', text: 'Sam Example', size: 14, x: 40, y: 60, ...textBox('Sam Example', 14), at: 1 };
const BOX = { page: 'p1', type: 'redact', x: 10, y: 10, w: 100, h: 20, at: 2 };
const board = (mark, extra = {}) => ({
  wins: [{
    id: 'd1', kind: 'yorPdf', x: 0, y: 0, w: 800, h: 600, pdfDoc: { order: ['p1'] },
    'pf.f1': { name: 'made-up.pdf', data: '', bytes: 0 },
    'pp.p1': { file: 'f1', index: 0, w: 612, h: 792, rot: 0 },
    'pm.m1': mark,
    ...extra,
  }],
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

const markOf = (doc, base, id = 'm1') => readPdf(readDocState(doc, base).wins[0]).marks[id];
const typed = (text) => ({ ...MARK, text, ...textBox(text, MARK.size) });

afterEach(cleanup);

test('Pat and Sam typing in one text box keep both their words, and the box fits them', () => {
  const base = board(MARK);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(typed('Signed: Sam Example')), LOCAL);
  writeStateToDoc(b, base, board(typed('Sam Example, witness')), LOCAL);
  sync();
  const want = 'Signed: Sam Example, witness';
  for (const doc of [a, b]) {
    const m = markOf(doc, base);
    expect(m.text).toBe(want);
    expect(m.w).toBe(textBox(want, MARK.size).w);
  }
});

test('Pat types while Sam drags the text box; both stay', () => {
  const base = board(MARK);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(typed('Sam Example!')), LOCAL);
  writeStateToDoc(b, base, board({ ...MARK, x: 300, y: 400 }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const m = markOf(doc, base);
    expect([m.text, m.x, m.y, m.type]).toEqual(['Sam Example!', 300, 400, 'text']);
  }
});

test('a mark with no words (a blacked-out box) still moves whole', () => {
  const base = board(MARK, { 'pm.r1': BOX });
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(MARK, { 'pm.r1': { ...BOX, x: 200, w: 150 } }), LOCAL);
  sync();
  expect(markOf(b, base, 'r1')).toEqual({ ...BOX, x: 200, w: 150 });
});

test('a removed text box stays removed on both screens', () => {
  const base = board(MARK);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(null), LOCAL);
  sync();
  expect(markOf(b, base)).toBeUndefined();
});

test('a text box saved whole by an older board still merges after its first edit', () => {
  const base = board(MARK);
  const { a, b, sync } = startBoth(base);
  // An older board saved the mark as one plain map, its words plain text.
  a.getMap('canvas').get('windows').get('d1').set('pm.m1', new Y.Map(Object.entries(MARK)));
  sync();
  const one = board(typed('Sam Example, 2026'));
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board(typed('Pat: Sam Example, 2026')), LOCAL);
  writeStateToDoc(b, one, board(typed('Sam Example, 2026. OK')), LOCAL);
  sync();
  for (const doc of [a, b]) expect(markOf(doc, base).text).toBe('Pat: Sam Example, 2026. OK');
});

test("a teammate's letters show in the text box and keep your cursor in place", () => {
  const mark = (text) => (
    <PdfMark id="m1" mark={{ ...MARK, text }} box={MARK} scale={1} selected editing
      onPointerDown={() => {}} onDoubleClick={() => {}} onText={() => {}} onEndEdit={() => {}} />
  );
  const { rerender } = render(mark('Sam Example'));
  const box = screen.getByLabelText('Text on the page');
  act(() => { box.focus(); box.setSelectionRange(3, 3); });
  rerender(mark('Signed: Sam Example'));
  expect(box.value).toBe('Signed: Sam Example');
  expect(box.value.slice(0, box.selectionStart)).toBe('Signed: Sam');
});
