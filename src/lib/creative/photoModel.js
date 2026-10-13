// Censai Photo board state. The document outline lives in `photoDoc`; each
// layer is its own window field (`pl.<id>`), so two people working on
// different layers at the same moment both keep their work after the CRDT
// sync. A removed layer is set to null. Raster pixels are a data URL on the
// layer; adjustments are numbers, so they sync without re-encoding pixels.
//
//   photoDoc   { w, h, bg, order: [layerId, …] }   order is bottom → top
//   pl.<id>    { kind: 'raster' | 'text', name, x, y, visible, opacity,
//                blend, adj, src?, w?, h?, text?, size?, color?, weight?, at }

import { newPartId, orderedIds, readParts } from '../office/officeParts.js';

export const PHOTO_PART = 'pl';
export const MAX_PHOTO_EDGE = 1600;

export const BLENDS = Object.freeze({
  'source-over': 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'soft-light': 'Soft light',
  difference: 'Difference',
});

// Adjustment sliders: [key, label, min, max, neutral].
export const ADJUSTMENTS = Object.freeze([
  ['brightness', 'Brightness', -100, 100, 0],
  ['contrast', 'Contrast', -100, 100, 0],
  ['saturation', 'Saturation', -100, 100, 0],
  ['hue', 'Hue', -180, 180, 0],
  ['blur', 'Blur', 0, 20, 0],
  ['grayscale', 'Mono', 0, 100, 0],
  ['sepia', 'Sepia', 0, 100, 0],
  ['invert', 'Invert', 0, 100, 0],
]);

export const PRESETS = Object.freeze({
  none: { label: 'Original', adj: {} },
  mono: { label: 'Mono', adj: { grayscale: 100, contrast: 10 } },
  sepia: { label: 'Sepia', adj: { sepia: 80, contrast: 5 } },
  vivid: { label: 'Vivid', adj: { saturation: 45, contrast: 12 } },
  fade: { label: 'Fade', adj: { contrast: -25, brightness: 8, saturation: -20 } },
  noir: { label: 'Noir', adj: { grayscale: 100, contrast: 45, brightness: -8 } },
  invert: { label: 'Invert', adj: { invert: 100 } },
});

export function layerKey(id) {
  return `${PHOTO_PART}.${id}`;
}

/** A canvas 2D `filter` string for a layer's adjustments ('none' when neutral). */
export function filterString(adj = {}) {
  const parts = [];
  const n = (k) => Number(adj[k]) || 0;
  if (n('brightness')) parts.push(`brightness(${100 + n('brightness')}%)`);
  if (n('contrast')) parts.push(`contrast(${100 + n('contrast')}%)`);
  if (n('saturation')) parts.push(`saturate(${100 + n('saturation')}%)`);
  if (n('hue')) parts.push(`hue-rotate(${n('hue')}deg)`);
  if (n('grayscale')) parts.push(`grayscale(${n('grayscale')}%)`);
  if (n('sepia')) parts.push(`sepia(${n('sepia')}%)`);
  if (n('invert')) parts.push(`invert(${n('invert')}%)`);
  if (n('blur')) parts.push(`blur(${n('blur')}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

export function makeLayer(kind = 'raster', fields = {}) {
  const base = { kind, name: kind === 'text' ? 'Text' : 'Layer', x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', adj: {}, at: Date.now() };
  if (kind === 'text') return { ...base, text: 'Text', size: 64, color: '#111111', weight: 600, ...fields };
  return { ...base, src: null, ...fields };
}

export function makePhotoDoc({ w = 1200, h = 800, bg = '#ffffff' } = {}) {
  return { photoDoc: { w, h, bg, order: ['l1'] }, [layerKey('l1')]: { ...makeLayer('raster', { name: 'Layer 1', w, h }), at: 1 } };
}

/** The document as the editor uses it: size, background and live layers bottom → top. */
export function readPhoto(win = {}) {
  const meta = win.photoDoc || {};
  const layers = readParts(win, PHOTO_PART);
  const order = orderedIds(meta.order, layers);
  return { w: Number(meta.w) || 1200, h: Number(meta.h) || 800, bg: meta.bg ?? '#ffffff', order, layers };
}

function withOrder(doc, order, extra = {}) {
  return { photoDoc: { w: doc.w, h: doc.h, bg: doc.bg, order, ...extra } };
}

/** Add a layer above `aboveId` (or on top). Returns { id, patch }. */
export function addLayerPatch(doc, layer, aboveId = null) {
  const id = newPartId('l');
  const order = [...doc.order];
  const at = aboveId && order.includes(aboveId) ? order.indexOf(aboveId) + 1 : order.length;
  order.splice(at, 0, id);
  return { id, patch: { ...withOrder(doc, order), [layerKey(id)]: { ...layer, at: Date.now() } } };
}

export function removeLayerPatch(doc, id) {
  return { ...withOrder(doc, doc.order.filter((x) => x !== id)), [layerKey(id)]: null };
}

/** Move a layer up (+1, toward the top) or down (-1). Null when it can't move. */
export function moveLayerPatch(doc, id, delta) {
  const order = [...doc.order];
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return null;
  [order[i], order[j]] = [order[j], order[i]];
  return withOrder(doc, order);
}

/** Crop the document to a rectangle. Pixels are kept: every layer just shifts. */
export function cropPatch(doc, rect) {
  const r = normRect(rect);
  const x = Math.max(0, Math.round(r.x));
  const y = Math.max(0, Math.round(r.y));
  const w = Math.max(1, Math.min(doc.w - x, Math.round(r.w)));
  const h = Math.max(1, Math.min(doc.h - y, Math.round(r.h)));
  const patch = { photoDoc: { w, h, bg: doc.bg, order: doc.order } };
  for (const id of doc.order) {
    const l = doc.layers[id];
    patch[layerKey(id)] = { ...l, x: (l.x || 0) - x, y: (l.y || 0) - y };
  }
  return patch;
}

/** Make the document match a picture's size (used when the first picture comes in). */
export function resizeDocPatch(doc, w, h) {
  return withOrder(doc, doc.order, { w, h });
}

/** True when nothing has been drawn, typed or imported yet. */
export function isBlank(doc) {
  return doc.order.every((id) => doc.layers[id].kind === 'raster' && !doc.layers[id].src);
}

/** A rectangle with positive width and height. */
export function normRect(r) {
  const x = Math.min(r.x, r.x + r.w);
  const y = Math.min(r.y, r.y + r.h);
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}
