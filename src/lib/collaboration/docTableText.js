// A Writer table keeps its cells in `rows`, a list of rows of words. Before,
// the whole table was saved as one piece, so when Pat typed in one cell while
// Sam typed in another, the last one to type replaced the other's whole table.
// Now every cell's words live in a Y.Text inside a shared list of rows, so a
// change to one cell never touches another, two people typing in the same
// cell merge letter by letter, and a row or column added at the same moment
// keeps everyone's typing. Pure: no sockets.
import * as Y from 'yjs';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';

const cellToY = (word) => new Y.Text(String(word ?? ''));

function rowToY(row) {
  const arr = new Y.Array();
  arr.push((Array.isArray(row) ? row : []).map(cellToY));
  return arr;
}

/** A whole table as a shared list of rows, each cell's words ready to merge. */
export function rowsToY(rows) {
  const arr = new Y.Array();
  arr.push((Array.isArray(rows) ? rows : []).map(rowToY));
  return arr;
}

// Words saved as plain text before this become a Y.Text on their first edit.
function writeCell(row, c, word) {
  const live = row.get(c);
  if (live instanceof Y.Text) {
    applyTextDiff(live, diffText(live.toString(), String(word ?? '')));
    return;
  }
  row.delete(c, 1);
  row.insert(c, [cellToY(word)]);
}

// Only cells this screen changed are written. A column added or taken away at
// the end is added or taken away at the end of the shared row.
function writeRow(row, prev, next) {
  const shared = Math.min(prev.length, next.length);
  for (let c = 0; c < shared && c < row.length; c += 1) {
    if (prev[c] !== next[c]) writeCell(row, c, next[c]);
  }
  if (next.length > prev.length) row.push(next.slice(prev.length).map(cellToY));
  else if (next.length < prev.length && row.length > next.length) {
    row.delete(next.length, Math.min(row.length, prev.length) - next.length);
  }
}

/**
 * Write a table's rows cell by cell into the block's shared map. With no
 * earlier copy here, or a table saved as one piece before, the rows are
 * written whole (once); after that only what changed is written.
 */
export function writeTableRows(map, prevRows, nextRows) {
  const live = map.get('rows');
  const next = Array.isArray(nextRows) ? nextRows : [];
  if (!(live instanceof Y.Array) || !Array.isArray(prevRows)) {
    map.set('rows', rowsToY(next));
    return;
  }
  const shared = Math.min(prevRows.length, next.length);
  for (let r = 0; r < shared && r < live.length; r += 1) {
    const prev = Array.isArray(prevRows[r]) ? prevRows[r] : [];
    const want = Array.isArray(next[r]) ? next[r] : [];
    const row = live.get(r);
    if (row instanceof Y.Array) writeRow(row, prev, want);
    else if (JSON.stringify(prev) !== JSON.stringify(want)) {
      live.delete(r, 1);
      live.insert(r, [rowToY(want)]);
    }
  }
  if (next.length > prevRows.length) live.push(next.slice(prevRows.length).map(rowToY));
  else if (next.length < prevRows.length && live.length > next.length) {
    live.delete(next.length, Math.min(live.length, prevRows.length) - next.length);
  }
}
