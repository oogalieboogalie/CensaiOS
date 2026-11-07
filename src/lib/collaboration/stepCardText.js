// A Step cards window keeps its cards in `cards`, each with its own `steps`.
// Cards already merged one by one (windowLists.js), but a card's steps were
// saved as one piece, so when Pat filled in what the helper said on one step
// while Sam ran the check on another, the last one to change anything
// replaced the other's steps. And the helper's answer (`report`) was saved
// only on click-away, whole. Now each step changes on its own, and a step's
// answer is a Y.Text, so two people typing in it merge letter by letter.
// Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { syncById, writeWindowList } from './windowLists.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isReport = (key, value) => key === 'report' && typeof value === 'string';

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export function mapOf(record, partToY) {
  const map = new Y.Map();
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && typeof value !== 'function') map.set(key, partToY(key, value));
  }
  return map;
}

// Change one record in place, key by key; `writePart` handles the keys that merge.
export function editRecord(map, prev, next, writePart) {
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || typeof value === 'function' || same(prev[key], value)) continue;
    if (!writePart(map, key, prev[key], value)) map.set(key, valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) || next[key] === undefined) map.delete(key);
  }
}

/** One step as a shared map, its answer ready to merge. */
export function stepToY(step) {
  if (!isRecord(step)) return valueToY(step);
  return mapOf(step, (key, value) => (isReport(key, value) ? new Y.Text(value) : valueToY(value)));
}

// An answer saved as plain text before this becomes a Y.Text on its first edit.
function writeStepPart(map, key, _prev, value) {
  if (!isReport(key, value)) return false;
  const live = map.get(key);
  if (live instanceof Y.Text) applyTextDiff(live, diffText(live.toString(), value));
  else map.set(key, new Y.Text(value));
  return true;
}

const STEPS = { edit: (map, prev, next) => editRecord(map, prev, next, writeStepPart), toY: stepToY };

function stepsToY(steps) {
  const arr = new Y.Array();
  arr.push(steps.map(stepToY));
  return arr;
}

/** One card as a shared map: its steps a list that merges step by step. */
export function cardToY(card) {
  if (!isRecord(card)) return valueToY(card);
  return mapOf(card, (key, value) => (key === 'steps' && Array.isArray(value) ? stepsToY(value) : valueToY(value)));
}

// A card's steps change step by step; steps that can't (no shared list yet,
// or reordered) are written whole, ready to merge from then on.
function writeCardPart(map, key, prev, value) {
  if (key !== 'steps' || !Array.isArray(value)) return false;
  const live = map.get('steps');
  if (!(live instanceof Y.Array) || !Array.isArray(prev) || !syncById(live, prev, value, STEPS)) {
    map.set('steps', stepsToY(value));
  }
  return true;
}

const CARDS = { edit: (map, prev, next) => editRecord(map, prev, next, writeCardPart), toY: cardToY };

/**
 * Write a window's `cards` card by card, step by step. A list that can't be
 * merged (no shared copy yet, or reordered) is written whole, its answers
 * ready to merge from the start. False when the value is not a list.
 */
export function writeStepCards(target, prevValue, nextValue) {
  if (!Array.isArray(nextValue)) return false;
  if (writeWindowList(target, 'cards', prevValue, nextValue, CARDS)) return true;
  const arr = new Y.Array();
  arr.push(nextValue.map(cardToY));
  target.set('cards', arr);
  return true;
}
