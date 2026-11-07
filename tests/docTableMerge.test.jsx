/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { DocImageBlock, DocTableBlock } from '../src/components/office/docs/DocMediaBlocks.jsx';

// A Writer table merges cell by cell and letter by letter, and a picture's
// caption merges letter by letter: Pat and Sam typing in one table at the same
// moment both keep their words (before, the whole table was saved as one
// piece, so the last one to type replaced the other's). All words made up.
const LOCAL = 'local';
const ROWS = [['Item', 'Price'], ['Bread', '4'], ['Pie', '9']];
const table = (rows) => ({ type: 'table', at: 1, rows });
const pic = (alt) => ({ type: 'image', at: 2, src: 'data:image/png;base64,AA==', alt });
const board = (blocks) => ({ wins: [{ id: 'd1', kind: 'officeDocs', x: 0, y: 0, w: 800, h: 600, officeDoc: { order: Object.keys(blocks) }, ...Object.fromEntries(Object.entries(blocks).map(([id, b]) => [`ob.${id}`, b])) }] });
const edit = (rows, r, c, word) => rows.map((row, i) => (i !== r ? row : row.map((w, j) => (j === c ? word : w))));

function startBoth(blocks) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board(blocks);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const blockOf = (doc, base, id = 't1') => readDocState(doc, base).wins[0][`ob.${id}`];

afterEach(cleanup);

test('Pat and Sam type in different cells at once: both keep their words', () => {
  const { a, b, sync, base } = startBoth({ t1: table(ROWS) });
  writeStateToDoc(a, base, board({ t1: table(edit(ROWS, 1, 0, 'Rye bread')) }), LOCAL);
  writeStateToDoc(b, base, board({ t1: table(edit(ROWS, 2, 1, '12')) }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).rows).toEqual([['Item', 'Price'], ['Rye bread', '4'], ['Pie', '12']]);
});

test('Pat and Sam typing in the same cell keep both their words', () => {
  const { a, b, sync, base } = startBoth({ t1: table(ROWS) });
  writeStateToDoc(a, base, board({ t1: table(edit(ROWS, 1, 0, 'Fresh Bread')) }), LOCAL);
  writeStateToDoc(b, base, board({ t1: table(edit(ROWS, 1, 0, 'Bread loaf')) }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).rows[1][0]).toBe('Fresh Bread loaf');
});

test('a row and a column added while the other types keep the typing', () => {
  const { a, b, sync, base } = startBoth({ t1: table(ROWS) });
  writeStateToDoc(a, base, board({ t1: table([...ROWS, ['', '']]) }), LOCAL);
  writeStateToDoc(b, base, board({ t1: table(edit(ROWS, 2, 0, 'Apple pie')) }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).rows).toEqual([['Item', 'Price'], ['Bread', '4'], ['Apple pie', '9'], ['', '']]);
  const now = blockOf(a, base).rows;
  writeStateToDoc(a, board({ t1: table(now) }), board({ t1: table(now.map((row) => [...row, ''])) }), LOCAL);
  writeStateToDoc(b, board({ t1: table(now) }), board({ t1: table(edit(now, 0, 1, 'Price each')) }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).rows[0]).toEqual(['Item', 'Price each', '']);
});

test('a table saved as one piece before still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth({ t1: table(ROWS) });
  // An older board kept each cell as plain words.
  const old = new Y.Map();
  old.set('type', 'table');
  const rows = new Y.Array();
  rows.push(ROWS.map((row) => Y.Array.from(row)));
  old.set('rows', rows);
  a.getMap('canvas').get('windows').get('d1').set('ob.t1', old);
  sync();
  writeStateToDoc(a, base, board({ t1: table(edit(ROWS, 1, 0, 'Bread!')) }), LOCAL);
  sync();
  const after = board({ t1: table(edit(ROWS, 1, 0, 'Bread!')) });
  writeStateToDoc(a, after, board({ t1: table(edit(ROWS, 1, 0, 'Pat Bread!')) }), LOCAL);
  writeStateToDoc(b, after, board({ t1: table(edit(ROWS, 1, 0, 'Bread! yum')) }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base).rows[1][0]).toBe('Pat Bread! yum');
});

test("two people typing in one picture's caption keep both their words", () => {
  const { a, b, sync, base } = startBoth({ p1: pic('The shop') });
  writeStateToDoc(a, base, board({ p1: pic('Sunny: The shop') }), LOCAL);
  writeStateToDoc(b, base, board({ p1: pic('The shop at dawn') }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(blockOf(doc, base, 'p1').alt).toBe('Sunny: The shop at dawn');
});

test('typing in a cell hands the whole new table to the window', () => {
  const changes = [];
  render(<DocTableBlock block={table(ROWS)} onChange={(c) => changes.push(c)} />);
  fireEvent.change(screen.getByLabelText('Row 2 column 1'), { target: { value: 'Rye' } });
  expect(changes).toEqual([{ rows: edit(ROWS, 1, 0, 'Rye') }]);
});

test("a teammate's words show in your cell, and your cursor stays put", () => {
  const view = render(<DocTableBlock block={table(ROWS)} onChange={() => {}} />);
  const cell = screen.getByLabelText('Row 2 column 1');
  cell.focus();
  cell.setSelectionRange(5, 5);
  view.rerender(<DocTableBlock block={table(edit(ROWS, 1, 0, 'Pat: Bread'))} onChange={() => {}} />);
  expect(cell.value).toBe('Pat: Bread');
  expect(cell.value.slice(0, cell.selectionStart)).toBe('Pat: Bread');
});

test("a teammate's caption words keep your caption cursor put", () => {
  const view = render(<DocImageBlock block={pic('The shop')} onChange={() => {}} />);
  const box = screen.getByLabelText('Picture caption');
  box.focus();
  box.setSelectionRange(3, 3);
  view.rerender(<DocImageBlock block={pic('Our The shop')} onChange={() => {}} />);
  expect(box.value.slice(0, box.selectionStart)).toBe('Our The');
});
