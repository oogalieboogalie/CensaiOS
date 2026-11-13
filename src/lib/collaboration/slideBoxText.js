// The words inside a slide's text box live in a Y.Text inside the box's
// shared map, so when Pat and Sam type in the same box at the same moment
// both keep their words (before, the last one to type replaced the other's
// whole box). Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { myTypedMark } from './signedInName.js';

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** One box as a shared map, its words ready to merge. */
export function slideBoxToY(box) {
  if (!box || typeof box !== 'object' || typeof box.text !== 'string') return valueToY(box);
  const map = valueToY({ ...box, text: undefined });
  map.set('text', new Y.Text(box.text));
  return map;
}

/**
 * Change only the typed span of the box's words. Words saved before this (a
 * plain string) become a Y.Text on their first edit.
 */
export function writeSlideBoxText(map, value) {
  const current = map.get('text');
  if (current instanceof Y.Text) {
    // The new letters carry who typed them, for "Who typed what".
    applyTextDiff(current, diffText(current.toString(), value), myTypedMark());
    return;
  }
  map.set('text', new Y.Text(value));
}

/** Edit one box in place, field by field; its words merge letter by letter. */
export function editSlideBox(map, prev, next) {
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || same(prev[key], value)) continue;
    if (key === 'text' && typeof value === 'string') writeSlideBoxText(map, value);
    else map.set(key, valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) || next[key] === undefined) map.delete(key);
  }
}
