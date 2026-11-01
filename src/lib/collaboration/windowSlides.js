// A Slides window keeps each slide in its own field (`os.<slideId>`, see
// src/lib/office/officeParts.js). The slide's text boxes and pictures merge
// one box at a time instead of the slide being saved as one piece: when Pat
// types the title of slide 2 and Sam its body at the same moment, writing
// the whole slide kept only the last writer's copy. Here each change touches
// only its own box (syncById edits it in place), so both survive, and a
// slide someone removes at the same moment stays removed. Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { PART } from '../office/officeParts.js';
import { syncById } from './windowLists.js';

const SLIDE_PREFIX = `${PART.slide}.`;

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const isSlide = (s) => s !== null && typeof s === 'object' && !Array.isArray(s) && Array.isArray(s.blocks);

export const isSlideField = (field) => typeof field === 'string' && field.startsWith(SLIDE_PREFIX);

/**
 * Write one slide field box by box. Returns false when it can't (no shared
 * slide yet, a slide added or removed, or boxes without ids); the caller then
 * writes the whole value as before.
 */
export function writeWindowSlide(target, field, prevValue, nextValue) {
  const live = target.get(field);
  if (!(live instanceof Y.Map) || !isSlide(prevValue) || !isSlide(nextValue)) return false;
  const blocks = live.get('blocks');
  if (!(blocks instanceof Y.Array)) return false;
  // syncById says no before it changes anything, so a refusal leaves the
  // slide untouched for the caller's whole write.
  if (!same(prevValue.blocks, nextValue.blocks) && !syncById(blocks, prevValue.blocks, nextValue.blocks)) return false;
  for (const [key, value] of Object.entries(nextValue)) {
    if (key !== 'blocks' && value !== undefined && !same(prevValue[key], value)) live.set(key, valueToY(value));
  }
  for (const key of Object.keys(prevValue)) {
    if (!(key in nextValue) || nextValue[key] === undefined) live.delete(key);
  }
  return true;
}
