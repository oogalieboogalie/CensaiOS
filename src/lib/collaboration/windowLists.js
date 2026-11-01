// Lists inside a window that merge item by item instead of being saved as one
// piece. A To-do list keeps its to-dos in `items` and an Idea Pad its bullets
// in `ideas`; when two people each add one at the same moment, writing the
// whole list would keep only the last writer's copy. Here each add, edit or
// removal touches only its own item, so the other person's new one survives.
// Pure: no sockets, no React.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../server/collab/seedFromSnapshot.js';
import { isValidId } from '../../../server/collab/ySchema.js';

// Window fields holding lists that merge item by item: to-dos, Research
// questions, Step cards and Vault notes keyed by `id`, Idea Pad bullets
// (plain text) keyed by their words.
export const WINDOW_LIST_FIELDS = new Set(['items', 'ideas', 'researchAsks', 'cards', 'notes']);

let reportMerge = null;

/** Called with { field, kept } when a write kept items someone else added. */
export function setListMergeReporter(fn) {
  reportMerge = typeof fn === 'function' ? fn : null;
}

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const idOf = (item) => (isValidId(item?.id) ? String(item.id) : null);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// An edited item changes in place, field by field, so someone removing it at
// the same moment still removes it (a fresh copy would bring it back).
function editInPlace(map, prev, next) {
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && !same(prev[key], value)) map.set(key, valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) || next[key] === undefined) map.delete(key);
  }
}

// One key per item: its id, or for plain-text bullets the words plus which
// copy of those words it is, so two identical bullets stay two items.
function keysOf(list) {
  const seen = new Map();
  return list.map((item) => {
    if (typeof item !== 'string') return idOf(item);
    const n = seen.get(item) || 0;
    seen.set(item, n + 1);
    return `text:${n}:${item}`;
  });
}

// Erasing or editing items touches only those ids, so an item someone else
// adds at the same moment survives the merge. False when the lists aren't
// keyed by unique ids or were reordered (the caller replaces the list).
export function syncById(arr, prev, next) {
  const prevIds = keysOf(prev);
  const nextIds = keysOf(next);
  if (prevIds.includes(null) || nextIds.includes(null)) return false;
  if (new Set(prevIds).size !== prevIds.length || new Set(nextIds).size !== nextIds.length) return false;
  const prevById = new Map(prev.map((item, i) => [prevIds[i], item]));
  const nextById = new Map(next.map((item, i) => [nextIds[i], item]));
  const kept = prevIds.filter((id) => nextById.has(id));
  const keptInNext = nextIds.filter((id) => prevById.has(id));
  if (kept.some((id, i) => keptInNext[i] !== id)) return false; // reordered
  // A bullet whose words changed gets a new key; keep it in its place.
  const swapped = new Map();
  if (prev.length === next.length) {
    prevIds.forEach((id, i) => {
      if (!nextById.has(id) && !prevById.has(nextIds[i])) swapped.set(id, nextIds[i]);
    });
  }
  const docIds = keysOf(arr.toArray().map(valueFromY)).map((id) => id ?? '');
  const placed = new Set();
  for (let i = docIds.length - 1; i >= 0; i -= 1) {
    const id = docIds[i];
    const target = nextById.has(id) ? id : swapped.get(id);
    if (prevById.has(id) && (!target || !same(prevById.get(id), nextById.get(target)))) {
      const live = arr.get(i);
      if (target === id && live instanceof Y.Map && isRecord(prevById.get(id)) && isRecord(nextById.get(id))) {
        editInPlace(live, prevById.get(id), nextById.get(id));
        continue;
      }
      arr.delete(i, 1);
      if (target) { arr.insert(i, [valueToY(nextById.get(target))]); placed.add(target); }
    }
  }
  const added = next.filter((item, i) => !prevById.has(nextIds[i]) && !placed.has(nextIds[i]));
  if (added.length) arr.push(added.map((item) => valueToY(item)));
  return true;
}

/**
 * Write a window's list field item by item. Returns false when it can't
 * (no shared list yet, or the items have no ids); the caller then
 * writes the whole value as before.
 */
export function writeWindowList(target, field, prevValue, nextValue) {
  const arr = target.get(field);
  if (!(arr instanceof Y.Array) || !Array.isArray(prevValue) || !Array.isArray(nextValue)) return false;
  const known = new Set([...keysOf(prevValue), ...keysOf(nextValue)]);
  const others = keysOf(arr.toArray().map(valueFromY)).filter((id) => !known.has(id)).length;
  if (!syncById(arr, prevValue, nextValue)) return false;
  if (others && reportMerge) reportMerge({ field, kept: others });
  return true;
}
