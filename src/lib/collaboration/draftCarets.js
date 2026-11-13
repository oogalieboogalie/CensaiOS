// Live cursors in text someone edits as an unsaved copy (a CAD recipe: you
// type, then Run puts it on the board). Cursors travel as spots in the
// board's words, so a spot in my copy is turned into the matching spot on
// the board before it goes out, and a teammate's spot on the board is turned
// into the matching spot in my copy before it is drawn. A spot inside words
// only my copy has lands at the edge of that change. Pure.
import { diffText, rebaseCaret } from '../../../shared/collab/textDiff.js';

const move = (index, from, to) => {
  const a = String(from ?? '');
  const b = String(to ?? '');
  if (a === b) return index;
  return Math.max(0, Math.min(rebaseCaret(index, diffText(a, b)), b.length));
};

/** A spot in my unsaved copy, as a spot in the board's words. */
export const copyToBoard = (index, copy, board) => move(index, copy, board);

/** A teammate's spot in the board's words, as a spot in my unsaved copy. */
export const boardToCopy = (index, board, copy) => move(index, board, copy);
