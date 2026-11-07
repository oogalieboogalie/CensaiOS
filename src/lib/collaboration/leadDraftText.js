// A LeadHound window keeps its last hunt in `leadHound`: the brief, and the
// leads it found, each with a 7-day introduction plan (a subject and a
// message per day) and an ice breaker (title, opening line, deliverable and
// ask). Before, every letter typed in one of those drafts saved the whole
// hunt as one piece, so when Pat rewrote Day 1 while Sam fixed Day 3 (or both
// typed in the same message) the last one to type wiped out the other's
// words. Now each draft's words live in a Y.Text: a change that only edits
// words is written into just those drafts, letter by letter, and two people
// typing at once both keep what they typed. A new hunt or a cleared one is
// still written whole. Pure: no sockets.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';

/** The words people write in a lead's drafts. */
export const LEAD_DRAFT_KEYS = new Set(['subject', 'body', 'title', 'opening_line', 'deliverable', 'cta']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keysOf = (o) => Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== 'function').sort();

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** A whole hunt as shared values, every draft's words ready to merge. */
export function leadHoundToY(value, key = null) {
  if (typeof value === 'string' && LEAD_DRAFT_KEYS.has(key)) return new Y.Text(value);
  if (Array.isArray(value)) {
    const arr = new Y.Array();
    arr.push(value.map((item) => (item === undefined ? null : leadHoundToY(item))));
    return arr;
  }
  if (isObject(value)) {
    const map = new Y.Map();
    for (const k of keysOf(value)) map.set(k, leadHoundToY(value[k], k));
    return map;
  }
  return valueToY(value);
}

// Every place where only a draft's words changed, as { path, words }. Null
// when anything else changed (a lead added or removed, a new hunt...).
function wordEdits(prev, next, path = [], out = []) {
  if (same(prev, next)) return out;
  const key = path[path.length - 1];
  if (typeof next === 'string' && LEAD_DRAFT_KEYS.has(key) && (typeof prev === 'string' || prev === undefined)) {
    out.push({ path, words: next });
    return out;
  }
  if (Array.isArray(prev) && Array.isArray(next) && prev.length === next.length) {
    for (let i = 0; i < next.length; i += 1) if (!wordEdits(prev[i], next[i], [...path, i], out)) return null;
    return out;
  }
  if (isObject(prev) && isObject(next)) {
    const [a, b] = [keysOf(prev), keysOf(next)];
    const added = b.filter((k) => !a.includes(k));
    if (a.some((k) => !b.includes(k)) || added.some((k) => !LEAD_DRAFT_KEYS.has(k))) return null;
    for (const k of b) if (!wordEdits(prev[k], next[k], [...path, k], out)) return null;
    return out;
  }
  return null;
}

const step = (node, k) => {
  if (node instanceof Y.Map) return node.get(k);
  if (node instanceof Y.Array && Number.isInteger(k) && k < node.length) return node.get(k);
  return undefined;
};

// The shared spot each edit goes to; null when the board's copy no longer
// has it (a teammate started a new hunt), so the caller writes it whole.
function findSpots(live, edits) {
  const spots = [];
  for (const { path, words } of edits) {
    let parent = live;
    for (const k of path.slice(0, -1)) parent = step(parent, k);
    const last = path[path.length - 1];
    if (parent instanceof Y.Map && typeof last === 'string') spots.push({ parent, last, words });
    else if (parent instanceof Y.Array && Number.isInteger(last) && last < parent.length) spots.push({ parent, last, words });
    else return null;
  }
  return spots;
}

function writeWords({ parent, last, words }) {
  const current = step(parent, last);
  if (current instanceof Y.Text) {
    applyTextDiff(current, diffText(current.toString(), words));
  } else if (parent instanceof Y.Map) {
    parent.set(last, new Y.Text(words));
  } else {
    parent.delete(last, 1);
    parent.insert(last, [new Y.Text(words)]);
  }
}

/**
 * Write a window's `leadHound`: draft by draft and letter by letter when only
 * words changed, whole otherwise. False when the value is not a hunt.
 */
export function writeLeadHound(target, prevValue, nextValue) {
  if (!isObject(nextValue)) return false;
  const live = target.get('leadHound');
  if (live instanceof Y.Map) {
    const before = isObject(prevValue) ? prevValue : valueFromY(live);
    const edits = wordEdits(before, nextValue);
    const spots = edits && findSpots(live, edits);
    if (spots) {
      spots.forEach(writeWords);
      return true;
    }
  }
  target.set('leadHound', leadHoundToY(nextValue));
  return true;
}
