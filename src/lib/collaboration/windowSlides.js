// A Slides window keeps each slide in its own field (`os.<slideId>`, see
// src/lib/office/officeParts.js). The slide's text boxes and pictures merge
// one box at a time instead of the slide being saved as one piece: when Pat
// types the title of slide 2 and Sam its body at the same moment, writing
// the whole slide kept only the last writer's copy. Here each change touches
// only its own box (syncById edits it in place), so both survive, and a
// slide someone removes at the same moment stays removed. The speaker notes
// are a Y.Text, so two people typing in one slide's notes merge letter by
// letter (slideNotes.js), and so are the words inside each text box
// (slideBoxText.js). Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { slideToY, writeSlideNotes } from './slideNotes.js';
import { PART } from '../office/officeParts.js';
import { syncById } from './windowLists.js';
import { editSlideBox, slideBoxToY } from './slideBoxText.js';

const SLIDE_PREFIX = `${PART.slide}.`;
const BOXES = { edit: editSlideBox, toY: slideBoxToY };

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const isSlide = (s) => s !== null && typeof s === 'object' && !Array.isArray(s) && Array.isArray(s.blocks);

export const isSlideField = (field) => typeof field === 'string' && field.startsWith(SLIDE_PREFIX);

/**
 * Write one slide field box by box. Returns false only when the new value is
 * not a slide (a removed slide is null); the caller then writes it as is.
 * A slide that is new, or can't be merged box by box, is written whole, with
 * its notes as a Y.Text ready to merge.
 */
export function writeWindowSlide(target, field, prevValue, nextValue) {
  if (!isSlide(nextValue)) return false;
  const live = target.get(field);
  const blocks = live instanceof Y.Map ? live.get('blocks') : null;
  // syncById says no before it changes anything, so a refusal leaves the
  // slide untouched for the whole write below.
  if (!isSlide(prevValue) || !(blocks instanceof Y.Array)
    || (!same(prevValue.blocks, nextValue.blocks) && !syncById(blocks, prevValue.blocks, nextValue.blocks, BOXES))) {
    target.set(field, slideToY(nextValue));
    return true;
  }
  for (const [key, value] of Object.entries(nextValue)) {
    if (key === 'blocks' || value === undefined || same(prevValue[key], value)) continue;
    if (key === 'notes' && typeof value === 'string') writeSlideNotes(live, value);
    else live.set(key, valueToY(value));
  }
  for (const key of Object.keys(prevValue)) {
    if (!(key in nextValue) || nextValue[key] === undefined) live.delete(key);
  }
  return true;
}
