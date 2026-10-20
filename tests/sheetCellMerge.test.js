import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { setSheetMergeReporter } from '../src/lib/collaboration/windowSheet.js';
import { makeSheet, setCell, addRows } from '../src/components/sheets/sheetModel.js';

// Sam types in A1 and Pat in B2 of the same Sheet at the same moment: both
// keep what they typed, because the board sync writes one cell at a time.
const LOCAL = 'local';
const board = (sheet) => ({ wins: [{ id: 's1', kind: 'sheet', x: 0, y: 0, w: 600, h: 400, sheet }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const sheetOf = (doc, base) => readDocState(doc, base).wins[0].sheet;
const cell = (sheet, r, c) => sheet.rows[r].cells?.[sheet.columns[c].id]?.v;

describe('Sheet cells merge one cell at a time', () => {
  afterEach(() => setSheetMergeReporter(null));

  test('Sam in A1 and Pat in B2 at the same moment: both screens keep both cells', () => {
    const { a, b, sync } = offlinePair();
    const start = makeSheet();
    const base = board(start);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const kept = [];
    setSheetMergeReporter((info) => kept.push(info));
    const sam = setCell(start, start.rows[0].id, start.columns[0].id, { v: 'Sam: 12 signs' });
    const pat = setCell(start, start.rows[1].id, start.columns[1].id, { v: 'Pat: $40' });
    writeStateToDoc(a, base, board(sam), LOCAL);
    writeStateToDoc(b, base, board(pat), LOCAL);
    sync();
    for (const doc of [a, b]) {
      const sheet = sheetOf(doc, base);
      expect(cell(sheet, 0, 0)).toBe('Sam: 12 signs');
      expect(cell(sheet, 1, 1)).toBe('Pat: $40');
    }
    // A reload reads the same shared copy.
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(a));
    expect(cell(sheetOf(reloaded, base), 1, 1)).toBe('Pat: $40');
    expect(kept).toEqual([]);
  });

  test('a later write that keeps someone else\'s cell logs a count, never the words', () => {
    const { a, b, sync } = offlinePair();
    const start = makeSheet();
    const base = board(start);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    const pat = setCell(start, start.rows[1].id, start.columns[1].id, { v: 'Pat: $40' });
    writeStateToDoc(b, base, board(pat), LOCAL);
    sync();
    const kept = [];
    setSheetMergeReporter((info) => kept.push(info));
    // Sam's screen hasn't redrawn Pat's cell yet when Sam types.
    writeStateToDoc(a, base, board(setCell(start, start.rows[0].id, start.columns[0].id, { v: 'Sam' })), LOCAL);
    expect(kept).toEqual([{ kept: 1 }]);
    expect(cell(sheetOf(a, base), 1, 1)).toBe('Pat: $40');
  });

  test('adding a row while someone types still keeps both', () => {
    const { a, b, sync } = offlinePair();
    const start = makeSheet();
    const base = board(start);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, board(addRows(start, 1)), LOCAL);
    writeStateToDoc(b, base, board(setCell(start, start.rows[0].id, start.columns[0].id, { v: 'Mo' })), LOCAL);
    sync();
    const sheet = sheetOf(b, base);
    expect(sheet.rows).toHaveLength(start.rows.length + 1);
    expect(cell(sheet, 0, 0)).toBe('Mo');
    expect(sheetOf(a, base)).toEqual(sheet);
  });
});
