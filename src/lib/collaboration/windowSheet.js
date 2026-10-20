// A Sheet window's `sheet` merges cell by cell instead of being saved as one
// piece. When Sam types in A1 and Pat in B2 at the same moment, writing the
// whole sheet would keep only the last writer's copy; here a typed cell
// touches only that cell, so the other person's cell survives. Adding,
// removing or moving rows goes row by row (syncById), and everything else on
// the sheet (columns, name) is written whole as before. Pure: no sockets.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../server/collab/seedFromSnapshot.js';
import { syncById } from './windowLists.js';

let reportMerge = null;

/** Called with { kept } when a write kept cells someone else typed. */
export function setSheetMergeReporter(fn) {
  reportMerge = typeof fn === 'function' ? fn : null;
}

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const isSheet = (s) => s && typeof s === 'object' && Array.isArray(s.rows) && Array.isArray(s.columns);
const rowIds = (rows) => rows.map((row) => row?.id);

function rowMapById(rowsArr) {
  const out = new Map();
  rowsArr.forEach((row) => {
    if (row instanceof Y.Map && row.get('id') != null) out.set(String(row.get('id')), row);
  });
  return out;
}

// Cells someone else changed in the shared copy that this write leaves alone.
function othersCells(rowsArr, prevRows, written) {
  const prevById = new Map(prevRows.map((row) => [String(row.id), row]));
  let kept = 0;
  rowsArr.forEach((row) => {
    if (!(row instanceof Y.Map)) return;
    const id = String(row.get('id'));
    const cells = row.get('cells');
    if (!(cells instanceof Y.Map)) return;
    for (const [colId, cell] of cells.entries()) {
      if (written.has(`${id}:${colId}`)) continue;
      if (!same(valueFromY(cell), prevById.get(id)?.cells?.[colId])) kept += 1;
    }
  });
  return kept;
}

/**
 * Write a window's sheet cell by cell. Returns false when it can't (no
 * shared sheet yet, or not a sheet); the caller then writes it whole.
 */
export function writeWindowSheet(target, prevValue, nextValue) {
  const shared = target.get('sheet');
  if (!(shared instanceof Y.Map) || !isSheet(prevValue) || !isSheet(nextValue)) return false;
  const rowsArr = shared.get('rows');
  if (!(rowsArr instanceof Y.Array)) return false;
  for (const [key, value] of Object.entries(nextValue)) {
    if (key === 'rows' || value === undefined || same(prevValue[key], value)) continue;
    shared.set(key, valueToY(value));
  }
  for (const key of Object.keys(prevValue)) if (!(key in nextValue)) shared.delete(key);

  const written = new Set();
  if (same(rowIds(prevValue.rows), rowIds(nextValue.rows))) {
    const docRows = rowMapById(rowsArr);
    nextValue.rows.forEach((row, i) => {
      const before = prevValue.rows[i];
      if (same(before, row)) return;
      const docRow = docRows.get(String(row.id));
      if (!docRow) return;
      for (const [field, value] of Object.entries(row)) {
        if (field !== 'cells' && !same(before?.[field], value)) docRow.set(field, valueToY(value));
      }
      let cells = docRow.get('cells');
      if (!(cells instanceof Y.Map)) { cells = new Y.Map(); docRow.set('cells', cells); }
      const prevCells = before?.cells || {};
      const nextCells = row.cells || {};
      for (const [colId, cell] of Object.entries(nextCells)) {
        if (same(prevCells[colId], cell)) continue;
        cells.set(colId, valueToY(cell));
        written.add(`${row.id}:${colId}`);
      }
      for (const colId of Object.keys(prevCells)) {
        if (!(colId in nextCells)) { cells.delete(colId); written.add(`${row.id}:${colId}`); }
      }
    });
  } else if (!syncById(rowsArr, prevValue.rows, nextValue.rows)) {
    shared.set('rows', valueToY(nextValue.rows));
    return true;
  }
  const kept = othersCells(rowsArr, prevValue.rows, written);
  if (kept && reportMerge) reportMerge({ kept });
  return true;
}
