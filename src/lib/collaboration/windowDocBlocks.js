// A Writer (office Docs) window keeps each paragraph in its own field
// (`ob.<blockId>`, see src/lib/office/officeParts.js). Before, a paragraph
// was saved as one piece, so when Pat and Sam typed in the same paragraph at
// the same moment the last one to type replaced the other's words. Now the
// words of each paragraph live in a Y.Text, so both people's letters merge,
// and a style change (say, to a heading) made at the same moment as typing
// keeps both. Pure: no sockets.
import * as Y from 'yjs';
import { PART } from '../office/officeParts.js';
import { editSlideBox, slideBoxToY } from './slideBoxText.js';

const BLOCK_PREFIX = `${PART.block}.`;

const hasWords = (b) => b !== null && typeof b === 'object' && !Array.isArray(b) && typeof b.text === 'string';

export const isDocBlockField = (field) => typeof field === 'string' && field.startsWith(BLOCK_PREFIX);

/**
 * Write one paragraph field so its words merge letter by letter. Returns
 * false when the new value holds no words (a removed paragraph is null, a
 * table or picture has no `text`); the caller then writes it as is.
 */
export function writeWindowDocBlock(target, field, prevValue, nextValue) {
  if (!hasWords(nextValue)) return false;
  const live = target.get(field);
  if (live instanceof Y.Map && hasWords(prevValue)) editSlideBox(live, prevValue, nextValue);
  else target.set(field, slideBoxToY(nextValue));
  return true;
}
