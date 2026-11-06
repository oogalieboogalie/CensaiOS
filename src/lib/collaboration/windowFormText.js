// Some windows keep a whole form in one field: the Listing Writer keeps the
// address, price, city, beds, baths, size and features in `listing`. Before,
// the form was saved as one piece, so when Pat typed the features while Sam
// fixed the price, the last one to type replaced the other's whole form. Now
// the form is a shared map with one entry per box, and every box's words
// live in a Y.Text, so a change to one box never touches another, and two
// people typing in the same box merge letter by letter. Pure: no sockets.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';

/** Window fields that hold a form of boxes (a Listing Writer's `listing`). */
export const WINDOW_FORM_FIELDS = new Set(['listing']);
// Some windows keep one part per field under a prefix; only the words in it
// merge letter by letter, while its font, colour and place are picked whole:
// a YorWare Layout story (`lst.<id>`), a Censai Photo layer (`pl.<id>`: its
// text and name) and a Censai Video clip (`vc.<id>`: a title's text).
const PART_TEXT_KEYS = {
  'lst.': new Set(['text']),
  'pl.': new Set(['text', 'name']),
  'vc.': new Set(['text']),
};
const partPrefix = (field) => (typeof field === 'string'
  ? Object.keys(PART_TEXT_KEYS).find((prefix) => field.startsWith(prefix)) : undefined);

export const isFormField = (field) => WINDOW_FORM_FIELDS.has(field) || Boolean(partPrefix(field));

const textKeysOf = (field) => PART_TEXT_KEYS[partPrefix(field)] || null;

const isForm = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// textKeys: which boxes hold words that merge; null means every text box.
const isWords = (key, value, textKeys) => typeof value === 'string' && (!textKeys || textKeys.has(key));
const boxToY = (key, value, textKeys) => (isWords(key, value, textKeys) ? new Y.Text(value) : valueToY(value));

/** A whole form as a shared map, each box's words ready to merge. */
export function formToY(form, textKeys = null) {
  const map = new Y.Map();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || typeof value === 'function') continue;
    map.set(key, boxToY(key, value, textKeys));
  }
  return map;
}

function writeBox(map, key, value, textKeys) {
  const current = map.get(key);
  if (isWords(key, value, textKeys) && current instanceof Y.Text) {
    applyTextDiff(current, diffText(current.toString(), value));
    return;
  }
  // Words saved as plain text before this become a Y.Text on their first edit.
  map.set(key, boxToY(key, value, textKeys));
}

/**
 * Write one form field box by box. Returns false when the new value is not a
 * form (say, null); the caller then writes it as is.
 */
export function writeWindowForm(target, field, prevValue, nextValue) {
  if (!isForm(nextValue)) return false;
  const textKeys = textKeysOf(field);
  const live = target.get(field);
  if (!(live instanceof Y.Map)) {
    target.set(field, formToY(nextValue, textKeys));
    return true;
  }
  // No earlier copy here (say, the window opened empty and a teammate's first
  // letters landed already): compare with the shared form, never replace it,
  // and remove nothing this screen never had.
  const had = isForm(prevValue) ? prevValue : {};
  const before = isForm(prevValue) ? prevValue : valueFromY(live);
  for (const [key, value] of Object.entries(nextValue)) {
    if (value === undefined || typeof value === 'function' || same(before[key], value)) continue;
    writeBox(live, key, value, textKeys);
  }
  for (const key of Object.keys(had)) {
    if (!(key in nextValue) || nextValue[key] === undefined) live.delete(key);
  }
  return true;
}
