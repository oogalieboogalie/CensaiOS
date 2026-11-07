// A Writer (office Docs) window keeps each paragraph in its own field
// (`ob.<blockId>`, see src/lib/office/officeParts.js). Before, a paragraph
// was saved as one piece, so when Pat and Sam typed in the same paragraph at
// the same moment the last one to type replaced the other's words. Now the
// words of each paragraph live in a Y.Text, so both people's letters merge,
// and a style change (say, to a heading) made at the same moment as typing
// keeps both. A table's cells and a picture's caption merge the same way
// (docTableText.js). Pure: no sockets.
import * as Y from 'yjs';
import { PART } from '../office/officeParts.js';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { rowsToY, writeTableRows } from './docTableText.js';

const BLOCK_PREFIX = `${PART.block}.`;
// The block keys that hold words: a paragraph's text and a picture's caption.
const WORD_KEYS = new Set(['text', 'alt']);

const isBlock = (b) => b !== null && typeof b === 'object' && !Array.isArray(b);
const isWords = (key, value) => WORD_KEYS.has(key) && typeof value === 'string';

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export const isDocBlockField = (field) => typeof field === 'string' && field.startsWith(BLOCK_PREFIX);

function partToY(key, value) {
  if (isWords(key, value)) return new Y.Text(value);
  if (key === 'rows' && Array.isArray(value)) return rowsToY(value);
  return valueToY(value);
}

/** One block as a shared map, its words and cells ready to merge. */
export function docBlockToY(block) {
  const map = new Y.Map();
  for (const [key, value] of Object.entries(block)) {
    if (value !== undefined && typeof value !== 'function') map.set(key, partToY(key, value));
  }
  return map;
}

// Change only the typed span; words saved before this become a Y.Text.
function writeWords(map, key, value) {
  const live = map.get(key);
  if (live instanceof Y.Text) applyTextDiff(live, diffText(live.toString(), value));
  else map.set(key, new Y.Text(value));
}

function editDocBlock(map, prev, next) {
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || typeof value === 'function' || same(prev[key], value)) continue;
    if (isWords(key, value)) writeWords(map, key, value);
    else if (key === 'rows' && Array.isArray(value)) writeTableRows(map, prev.rows, value);
    else map.set(key, valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) || next[key] === undefined) map.delete(key);
  }
}

/**
 * Write one block field so its words merge letter by letter. Returns false
 * when the new value is not a block (a removed paragraph is null); the caller
 * then writes it as is.
 */
export function writeWindowDocBlock(target, field, prevValue, nextValue) {
  if (!isBlock(nextValue)) return false;
  const live = target.get(field);
  if (live instanceof Y.Map && isBlock(prevValue)) editDocBlock(live, prevValue, nextValue);
  else target.set(field, docBlockToY(nextValue));
  return true;
}
