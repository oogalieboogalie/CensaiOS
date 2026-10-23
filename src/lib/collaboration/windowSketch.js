// A Sketchpad's shapes merge one shape at a time instead of the whole drawing.
// Sam's line and Pat's line, drawn at the same moment, used to collapse to
// whichever save landed last. Each shape is keyed by its id, the same way a
// to-do list merges one to-do at a time (windowLists.js). Pure aside from one
// app-log line when a write keeps a shape someone else drew. No shape text.
import * as Y from 'yjs';
import { valueFromY, valueToY } from '../../../server/collab/seedFromSnapshot.js';
import { isValidId } from '../../../server/collab/ySchema.js';
import { logToApp } from '../appLog/browserLog.js';
import { syncById } from './windowLists.js';

const shapeId = (el) => (isValidId(el?.id) ? String(el.id) : null);

function sameJson(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * Three-way merge of sketch shapes. `shared` is the board's copy, `prev` is
 * what this browser last saved, `next` is what it wants now. A shape only the
 * board has stays. A shape this browser added, edited or removed changes
 * only that shape.
 */
export function mergeSketchElements(shared, prev, next) {
  const board = Array.isArray(shared) ? shared : [];
  const before = Array.isArray(prev) ? prev : [];
  const after = Array.isArray(next) ? next : [];
  const beforeIds = before.map(shapeId);
  const afterIds = after.map(shapeId);
  if (beforeIds.includes(null) || afterIds.includes(null)) return after.slice();
  if (new Set(beforeIds).size !== beforeIds.length || new Set(afterIds).size !== afterIds.length) return after.slice();
  const beforeBy = new Map(before.map((el, i) => [beforeIds[i], el]));
  const afterBy = new Map(after.map((el, i) => [afterIds[i], el]));
  const removed = new Set(beforeIds.filter((id) => !afterBy.has(id)));
  const keptBefore = beforeIds.filter((id) => afterBy.has(id));
  const keptAfter = afterIds.filter((id) => beforeBy.has(id));
  const extras = () => board.filter((el) => {
    const id = shapeId(el);
    return id && !afterBy.has(id) && !beforeBy.has(id);
  });
  if (keptBefore.some((id, i) => keptAfter[i] !== id)) {
    const added = extras();
    return added.length ? [...after, ...added] : after.slice();
  }
  const out = [];
  const seen = new Set();
  for (const el of board) {
    const id = shapeId(el);
    if (!id) { out.push(el); continue; }
    if (removed.has(id) || seen.has(id)) continue;
    out.push(afterBy.has(id) ? afterBy.get(id) : el);
    seen.add(id);
  }
  for (const el of after) {
    const id = shapeId(el);
    if (id && !seen.has(id)) { out.push(el); seen.add(id); }
  }
  return out;
}

/**
 * What the pad shows once a queued save goes out: the saved shapes, plus any
 * shape started on this pad while the save waited (a text box being typed, a
 * stroke mid-draw). Before, the save put back the older list and those shapes
 * vanished. Logs the window id only, never shape text.
 */
export function keepStartedShapes(now, queued, sent, windowId) {
  const known = new Set([...(queued || []), ...(sent || [])].map(shapeId));
  const started = (Array.isArray(now) ? now : []).filter((el) => shapeId(el) && !known.has(shapeId(el)));
  if (started.length) logToApp('info', `sketchpad: kept ${started.length} shape(s) started while saving`, { where: 'sketchpad', detail: `window ${windowId}` });
  return [...(sent || []), ...started];
}

function elementsOf(state) {
  const list = state?.excalidraw?.elements;
  return Array.isArray(list) ? list : null;
}

function writeChanged(map, prev, next, skip) {
  if (!prev || typeof prev !== 'object' || !next || typeof next !== 'object') return;
  for (const [key, value] of Object.entries(next)) {
    if (skip.has(key) || value === undefined || sameJson(prev[key], value)) continue;
    map.set(key, valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!skip.has(key) && !(key in next)) map.delete(key);
  }
}

function noteKept(kept) {
  logToApp('info', `sketchpad: merged shapes, kept ${kept} drawn by someone else at the same moment`, { where: 'sketchpad' });
}

/**
 * Write a window's Sketchpad scene shape by shape. Returns false when it
 * can't (no shared scene yet, or the shapes have no ids); the caller then
 * writes the whole state as before.
 */
export function writeWindowSketch(target, prevState, nextState) {
  const prevEls = elementsOf(prevState);
  const nextEls = elementsOf(nextState);
  if (!prevEls || !nextEls) return false;
  const state = target.get('state');
  if (!(state instanceof Y.Map)) return false;
  const drawing = state.get('excalidraw');
  if (!(drawing instanceof Y.Map)) return false;
  const arr = drawing.get('elements');
  if (!(arr instanceof Y.Array)) return false;
  const known = new Set();
  for (const el of [...prevEls, ...nextEls]) {
    const id = shapeId(el);
    if (id) known.add(id);
  }
  const others = arr.toArray().map(valueFromY).map(shapeId).filter((id) => id && !known.has(id)).length;
  if (!syncById(arr, prevEls, nextEls)) return false;
  writeChanged(state, prevState, nextState, new Set(['excalidraw']));
  writeChanged(drawing, prevState.excalidraw, nextState.excalidraw, new Set(['elements']));
  if (others) noteKept(others);
  return true;
}
