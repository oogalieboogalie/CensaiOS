// An Idea Pad keeps its bullets in `ideas`, plain words with no ids. Adding
// or removing a bullet already merged one by one (windowLists.js), but
// changing a bullet's words swapped the whole bullet for a new one, so when
// Pat and Sam typed in the same bullet at once it came out doubled or lost
// one person's letters. Now each bullet's words are a Y.Text: a bullet whose
// words changed is found in the shared list and only the typed letters are
// written into it, so two people typing in one bullet merge letter by letter.
// Pure: no sockets.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { writeWindowList } from './windowLists.js';

/** One bullet as shared words, ready to merge. */
export const bulletToY = (item) => (typeof item === 'string' ? new Y.Text(item) : valueToY(item));

// Which copy of these words (first, second...) sits at `index` in `list`.
const copyNumber = (list, index) => list.slice(0, index).filter((item) => item === list[index]).length;

function nthIndex(list, words, n) {
  for (let i = 0, seen = 0; i < list.length; i += 1) {
    if (list[i] !== words) continue;
    if (seen === n) return i;
    seen += 1;
  }
  return -1;
}

// Where each edited bullet sits in the shared list: the same copy of its old
// words, or, when a teammate's letters already changed it, the same place
// (only while nobody has added or removed a bullet). Null when one is lost.
function findEdited(live, prev, next) {
  const edits = [];
  for (let i = 0; i < next.length; i += 1) {
    if (prev[i] === next[i]) continue;
    if (typeof prev[i] !== 'string' || typeof next[i] !== 'string') return null;
    let at = nthIndex(live, prev[i], copyNumber(prev, i));
    if (at < 0 && live.length === prev.length) at = i;
    if (at < 0) return null;
    edits.push({ at, words: next[i] });
  }
  return edits;
}

// Write only the typed letters into each edited bullet. A bullet saved as
// plain words before this becomes shared words on its first edit.
function editBullets(arr, prev, next) {
  if (prev.length !== next.length) return false;
  const edits = findEdited(arr.toArray().map(valueFromY), prev, next);
  if (!edits) return false;
  for (const { at, words } of edits) {
    const live = arr.get(at);
    if (live instanceof Y.Text) {
      applyTextDiff(live, diffText(live.toString(), words));
    } else {
      arr.delete(at, 1);
      arr.insert(at, [new Y.Text(words)]);
    }
  }
  return true;
}

/**
 * Write a window's `ideas` bullet by bullet, letter by letter. A list that
 * can't be merged (no shared copy yet, or reordered) is written whole, its
 * bullets ready to merge from the start. False when the value is not a list.
 */
export function writeIdeaBullets(target, prevValue, nextValue) {
  if (!Array.isArray(nextValue)) return false;
  const arr = target.get('ideas');
  if (arr instanceof Y.Array && Array.isArray(prevValue) && editBullets(arr, prevValue, nextValue)) return true;
  if (writeWindowList(target, 'ideas', prevValue, nextValue, { toY: bulletToY })) return true;
  const fresh = new Y.Array();
  fresh.push(nextValue.map(bulletToY));
  target.set('ideas', fresh);
  return true;
}
