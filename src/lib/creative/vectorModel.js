// Censai Vector board state. The artboard outline is `vectorDoc`; each shape
// is its own window field (`vs.<id>`), so two people drawing or moving
// different shapes at once both keep their work after the CRDT sync.
//
//   vectorDoc  { w, h, bg, order: [shapeId, …] }   order is back → front
//   vs.<id>    a shape (see vectorGeom.js)

import { newPartId, orderedIds, readParts } from '../office/officeParts.js';
import { moveShape, shapeBox, unionBox } from './vectorGeom.js';
import { SHAPE_FILL, SHAPE_STROKE } from './creativeColors.js';

export const VECTOR_PART = 'vs';

export function shapeKey(id) {
  return `${VECTOR_PART}.${id}`;
}

export const DEFAULT_STYLE = Object.freeze({ fill: SHAPE_FILL, stroke: 'none', sw: 2, opacity: 1 });

export function makeShape(type, fields = {}) {
  const base = type === 'line' || (type === 'path' && fields.open)
    ? { fill: 'none', stroke: SHAPE_STROKE, sw: 3, opacity: 1 }
    : type === 'text' ? { fill: SHAPE_STROKE, stroke: 'none', sw: 0, opacity: 1, size: 48, weight: 600, text: 'Text' } : { ...DEFAULT_STYLE };
  const { open, ...rest } = fields;
  return { type, ...base, ...rest, at: Date.now() };
}

export function makeVectorDoc({ w = 1200, h = 800, bg = '#ffffff' } = {}) {
  return { vectorDoc: { w, h, bg, order: [] } };
}

export function readVector(win = {}) {
  const meta = win.vectorDoc || {};
  const shapes = readParts(win, VECTOR_PART);
  return { w: Number(meta.w) || 1200, h: Number(meta.h) || 800, bg: meta.bg ?? '#ffffff', order: orderedIds(meta.order, shapes), shapes };
}

function docPatch(doc, order, extra = {}) {
  return { vectorDoc: { w: doc.w, h: doc.h, bg: doc.bg, order, ...extra } };
}

/** Add shapes on top. Returns { ids, patch }. */
export function addShapesPatch(doc, shapes) {
  const ids = shapes.map(() => newPartId('s'));
  const now = Date.now();
  const patch = docPatch(doc, [...doc.order, ...ids]);
  shapes.forEach((s, i) => { patch[shapeKey(ids[i])] = { ...s, at: now + i }; });
  return { ids, patch };
}

export function removeShapesPatch(doc, ids) {
  const gone = new Set(ids);
  const patch = docPatch(doc, doc.order.filter((id) => !gone.has(id)));
  for (const id of ids) patch[shapeKey(id)] = null;
  return patch;
}

/** A patch writing changed shapes: { id: shape }. */
export function shapesPatch(changes) {
  const patch = {};
  for (const [id, s] of Object.entries(changes)) patch[shapeKey(id)] = s;
  return patch;
}

/** Selecting one member of a group selects the whole group. */
export function expandGroups(doc, ids) {
  const groups = new Set(ids.map((id) => doc.shapes[id]?.group).filter(Boolean));
  if (!groups.size) return ids.filter((id) => doc.shapes[id]);
  return doc.order.filter((id) => ids.includes(id) || groups.has(doc.shapes[id].group));
}

export function groupPatch(doc, ids) {
  const group = newPartId('g');
  return shapesPatch(Object.fromEntries(ids.map((id) => [id, { ...doc.shapes[id], group }])));
}

export function ungroupPatch(doc, ids) {
  return shapesPatch(Object.fromEntries(ids.map((id) => [id, { ...doc.shapes[id], group: null }])));
}

export function selectionBox(doc, ids) {
  return unionBox(ids.filter((id) => doc.shapes[id]).map((id) => shapeBox(doc.shapes[id])));
}

/** Bring to front (`front`) or send to back. Keeps the moved shapes' own order. */
export function reorderPatch(doc, ids, front = true) {
  const moving = doc.order.filter((id) => ids.includes(id));
  const rest = doc.order.filter((id) => !ids.includes(id));
  return docPatch(doc, front ? [...rest, ...moving] : [...moving, ...rest]);
}

// Units for align and distribute: a group moves as one piece.
function units(doc, ids) {
  const map = new Map();
  for (const id of ids) {
    const key = doc.shapes[id].group || id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(id);
  }
  return [...map.values()].map((members) => ({ members, box: selectionBox(doc, members) }));
}

function shiftUnits(doc, moves) {
  const changes = {};
  for (const { members, dx, dy } of moves) {
    if (!dx && !dy) continue;
    for (const id of members) changes[id] = moveShape(doc.shapes[id], dx, dy);
  }
  return shapesPatch(changes);
}

/**
 * Align the selection: left | center | right | top | middle | bottom. One
 * piece aligns to the artboard; several align to each other.
 */
export function alignPatch(doc, ids, mode) {
  const us = units(doc, ids);
  if (!us.length) return {};
  const ref = us.length === 1 ? { x: 0, y: 0, w: doc.w, h: doc.h } : unionBox(us.map((u) => u.box));
  return shiftUnits(doc, us.map(({ members, box }) => {
    const dx = mode === 'left' ? ref.x - box.x : mode === 'center' ? ref.x + ref.w / 2 - (box.x + box.w / 2) : mode === 'right' ? ref.x + ref.w - (box.x + box.w) : 0;
    const dy = mode === 'top' ? ref.y - box.y : mode === 'middle' ? ref.y + ref.h / 2 - (box.y + box.h / 2) : mode === 'bottom' ? ref.y + ref.h - (box.y + box.h) : 0;
    return { members, dx, dy };
  }));
}

/** Space three or more pieces evenly, horizontally ('h') or vertically ('v'). */
export function distributePatch(doc, ids, axis = 'h') {
  const us = units(doc, ids);
  if (us.length < 3) return {};
  const pos = axis === 'h' ? 'x' : 'y';
  const len = axis === 'h' ? 'w' : 'h';
  us.sort((a, b) => a.box[pos] - b.box[pos]);
  const start = us[0].box[pos];
  const end = Math.max(...us.map((u) => u.box[pos] + u.box[len]));
  const gap = (end - start - us.reduce((n, u) => n + u.box[len], 0)) / (us.length - 1);
  let cursor = start;
  return shiftUnits(doc, us.map(({ members, box }) => {
    const d = cursor - box[pos];
    cursor += box[len] + gap;
    return { members, dx: axis === 'h' ? d : 0, dy: axis === 'v' ? d : 0 };
  }));
}

/** Copies of shapes, nudged so they don't sit exactly on top; groups stay together. */
export function duplicateShapes(doc, ids, offset = 16) {
  const regroup = new Map();
  return ids.map((id) => {
    const s = doc.shapes[id];
    let group = s.group || null;
    if (group) {
      if (!regroup.has(group)) regroup.set(group, newPartId('g'));
      group = regroup.get(group);
    }
    return { ...moveShape(s, offset, offset), group };
  });
}
