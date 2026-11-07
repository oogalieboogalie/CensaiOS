// A Workflow window keeps its whole drawing in one field, `graph`
// ({ nodes, edges }, see src/lib/workflow/graph.js). Before, every change
// saved the whole drawing, so when Pat typed a step's instructions while Sam
// dragged another step, the last one to change anything replaced the other's
// whole graph. Now each step and each line between steps changes on its own
// (syncById edits it in place), and the words in a step (its name, its
// instructions, a start's text and a check's words) are a Y.Text, so two
// people typing in one step merge letter by letter. Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { syncById } from './windowLists.js';

/** A step's fields that hold words people type. */
export const STEP_TEXT_KEYS = new Set(['title', 'instructions', 'input', 'value']);

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const isGraph = (g) => g !== null && typeof g === 'object' && !Array.isArray(g)
  && Array.isArray(g.nodes) && Array.isArray(g.edges);
const isWords = (key, value) => STEP_TEXT_KEYS.has(key) && typeof value === 'string';

/** One step as a shared map, its words ready to merge. */
export function stepToY(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return valueToY(node);
  const map = new Y.Map();
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || typeof value === 'function') continue;
    map.set(key, isWords(key, value) ? new Y.Text(value) : valueToY(value));
  }
  return map;
}

/** Edit one step in place, field by field; its words change only where typed. */
// A step's place moves as one value: when x or y changes both are written,
// so two people dragging one step at once never mix x from one and y from the other.
const PAIRED = { x: 'y', y: 'x' };

export function editStep(map, prev, next) {
  const moved = (key) => key in next && !same(prev[key], next[key]);
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (same(prev[key], value) && !(PAIRED[key] && moved(PAIRED[key])))) continue;
    const current = map.get(key);
    if (isWords(key, value) && current instanceof Y.Text) applyTextDiff(current, diffText(current.toString(), value));
    else map.set(key, isWords(key, value) ? new Y.Text(value) : valueToY(value));
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) || next[key] === undefined) map.delete(key);
  }
}

/** A whole graph as a shared map: steps with merging words, lines as plain maps. */
export function graphToY(graph) {
  const map = new Y.Map();
  for (const [key, value] of Object.entries(graph)) {
    if (value === undefined || typeof value === 'function') continue;
    if (key === 'nodes') {
      const arr = new Y.Array();
      arr.push(value.map(stepToY));
      map.set(key, arr);
    } else map.set(key, valueToY(value));
  }
  return map;
}

const STEPS = { edit: editStep, toY: stepToY };

/**
 * Write a Workflow window's `graph` step by step. Returns false when the new
 * value is not a graph; the caller then writes it as is. A graph that can't
 * be merged (no shared copy yet, or its steps were reordered) is written
 * whole, with its words ready to merge from then on.
 */
export function writeWindowGraph(target, prevValue, nextValue) {
  if (!isGraph(nextValue)) return false;
  const live = target.get('graph');
  const nodes = live instanceof Y.Map ? live.get('nodes') : null;
  const edges = live instanceof Y.Map ? live.get('edges') : null;
  // syncById refuses before it changes anything, so a refusal leaves the
  // shared graph untouched for the whole write below.
  if (!isGraph(prevValue) || !(nodes instanceof Y.Array) || !(edges instanceof Y.Array)
    || (!same(prevValue.nodes, nextValue.nodes) && !syncById(nodes, prevValue.nodes, nextValue.nodes, STEPS))) {
    target.set('graph', graphToY(nextValue));
    return true;
  }
  if (!same(prevValue.edges, nextValue.edges) && !syncById(edges, prevValue.edges, nextValue.edges)) {
    live.set('edges', valueToY(nextValue.edges));
  }
  for (const [key, value] of Object.entries(nextValue)) {
    if (key === 'nodes' || key === 'edges' || value === undefined || same(prevValue[key], value)) continue;
    live.set(key, valueToY(value));
  }
  for (const key of Object.keys(prevValue)) {
    if (!(key in nextValue) || nextValue[key] === undefined) live.delete(key);
  }
  return true;
}
