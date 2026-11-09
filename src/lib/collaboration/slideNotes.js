// A slide's speaker notes live in a Y.Text inside the slide's shared map, so
// when Pat and Sam type in the notes of the same slide at the same moment
// both keep their words (before, the last one to type replaced the other's
// whole note). Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { slideBoxToY } from './slideBoxText.js';
import { myTypedMark } from './signedInName.js';

/** A whole slide as a shared map, its notes and box words ready to merge. */
export function slideToY(slide) {
  const map = valueToY({ ...slide, notes: undefined, blocks: undefined });
  if (Array.isArray(slide.blocks)) {
    const blocks = new Y.Array();
    blocks.push(slide.blocks.map((box) => (box === undefined ? null : slideBoxToY(box))));
    map.set('blocks', blocks);
  }
  if (typeof slide.notes === 'string') map.set('notes', new Y.Text(slide.notes));
  else if (slide.notes !== undefined) map.set('notes', valueToY(slide.notes));
  return map;
}

/**
 * Change only the typed span of the notes; the new letters carry who typed
 * them (shared/collab/typedBy.js). Notes saved before this (a plain string)
 * become a Y.Text on their first edit.
 */
export function writeSlideNotes(live, value) {
  const current = live.get('notes');
  if (current instanceof Y.Text) {
    applyTextDiff(current, diffText(current.toString(), value), myTypedMark());
    return;
  }
  live.set('notes', new Y.Text(value));
}
