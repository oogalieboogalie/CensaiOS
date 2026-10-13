// How a YorWare 3D Viewer window lives in board state. Like the other
// YorWare apps, each piece is its own window field, so one person adding a
// model while another drops a note on it merge instead of overwriting each
// other. A removed piece is set to null (undefined is skipped by the sync).
//
//   m3Scene        { order: [modelId…] }                    list order
//   m3.<modelId>   { name, format, main, files, bytes, at }  the model file(s) (never changes)
//   m3s.<modelId>  { visible, zUp, color }                   how it shows
//   m3n.<noteId>   { model, p: [x,y,z], text, by, at }       a note pinned to a point
//   m3View         { shading, grid, arrange }                how everyone sees the scene
//
// `files` maps each file name to its base64 bytes: one entry for a .glb or
// .stl, more when an .obj brings its .mtl and textures or a .gltf its .bin.
// A note's point is in the model's own coordinates, so it stays on the same
// spot when the model is laid out differently or stood up the other way.
import { newPartId, orderedIds, readParts } from '../office/officeParts.js';

export const MODEL_PART = Object.freeze({ model: 'm3', show: 'm3s', note: 'm3n' });
// Every model lives on the board, which every teammate downloads.
export const MAX_MODEL_BYTES = 10 * 1024 * 1024;
export const MAX_MODELS = 8;
export const MAX_NOTE_LENGTH = 280;
// What the color picker shows before a model is painted (the Clay look).
export const DEFAULT_PAINT = '#bdb8ae';
export const SHADINGS = Object.freeze([
  ['solid', 'Colors'], ['clay', 'Clay'], ['wire', 'Wireframe'], ['xray', 'X-ray'],
]);
export const ARRANGES = Object.freeze([['asMade', 'As made'], ['side', 'Side by side'], ['same', 'Same size']]);
export const DEFAULT_VIEW = Object.freeze({ shading: 'solid', grid: true, arrange: 'side' });

export const modelKey = (id) => `${MODEL_PART.model}.${id}`;
export const showKey = (id) => `${MODEL_PART.show}.${id}`;
export const noteKey = (id) => `${MODEL_PART.note}.${id}`;

// Printer and CAD formats are usually drawn with Z pointing up; three.js
// (and glTF) use Y. Those start stood up the right way.
const Z_UP_FORMATS = new Set(['stl', '3mf', 'ply', 'amf']);

export function normalizeShow(raw, format) {
  return {
    visible: raw?.visible !== false,
    zUp: typeof raw?.zUp === 'boolean' ? raw.zUp : Z_UP_FORMATS.has(format),
    color: /^#[0-9a-f]{6}$/i.test(raw?.color || '') ? raw.color.toLowerCase() : null,
  };
}

export function normalizeView(raw) {
  return {
    shading: SHADINGS.some(([k]) => k === raw?.shading) ? raw.shading : DEFAULT_VIEW.shading,
    grid: raw?.grid !== false,
    arrange: ARRANGES.some(([k]) => k === raw?.arrange) ? raw.arrange : DEFAULT_VIEW.arrange,
  };
}

function normalizeNote(raw) {
  const p = Array.isArray(raw?.p) ? raw.p.slice(0, 3).map((v) => Number(v) || 0) : null;
  if (!raw?.model || !p || p.length !== 3) return null;
  return { model: String(raw.model), p, text: String(raw.text || '').slice(0, MAX_NOTE_LENGTH), by: raw.by ? String(raw.by) : '', at: Number(raw.at) || 0 };
}

/** Everything the window needs, read from the window record. */
export function readScene(win) {
  const models = readParts(win, MODEL_PART.model);
  const order = orderedIds(win?.m3Scene?.order, models);
  const show = {};
  const rawShow = readParts(win, MODEL_PART.show);
  for (const id of order) show[id] = normalizeShow(rawShow[id], models[id].format);
  const notes = {};
  for (const [id, raw] of Object.entries(readParts(win, MODEL_PART.note))) {
    const n = normalizeNote(raw);
    if (n && models[n.model]) notes[id] = n;
  }
  const noteOrder = Object.keys(notes).sort((a, b) => notes[a].at - notes[b].at);
  const bytes = order.reduce((sum, id) => sum + (models[id].bytes || 0), 0);
  return { models, order, show, notes, noteOrder, view: normalizeView(win?.m3View), bytes };
}

/** The patch that adds models (already read into base64) to the end of the list. */
export function addModelsPatch(scene, items, now = Date.now()) {
  const room = Math.max(0, MAX_MODELS - scene.order.length);
  const ids = [];
  const patch = {};
  const tooBig = [];
  for (const item of items) {
    if (item.bytes > MAX_MODEL_BYTES) { tooBig.push(item.name); continue; }
    if (ids.length >= room) break;
    const id = newPartId('m');
    patch[modelKey(id)] = {
      name: String(item.name || 'Model'), format: item.format, main: item.main, files: item.files,
      bytes: item.bytes || 0, at: now + ids.length,
    };
    ids.push(id);
  }
  if (ids.length) patch.m3Scene = { order: [...scene.order, ...ids] };
  const skipped = items.length - ids.length - tooBig.length;
  return { ids, patch, skipped, tooBig };
}

export function removeModelPatch(scene, id) {
  const patch = { m3Scene: { order: scene.order.filter((x) => x !== id) }, [modelKey(id)]: null, [showKey(id)]: null };
  for (const [noteId, n] of Object.entries(scene.notes)) if (n.model === id) patch[noteKey(noteId)] = null;
  return patch;
}

export function showPatch(scene, id, change) {
  const format = scene.models[id]?.format;
  return { [showKey(id)]: normalizeShow({ ...scene.show[id], ...change }, format) };
}

export function viewPatch(scene, change) {
  return { m3View: normalizeView({ ...scene.view, ...change }) };
}

export function addNotePatch({ model, p, text, by }, now = Date.now()) {
  const id = newPartId('n');
  const note = normalizeNote({ model, p, text, by, at: now });
  return note ? { id, patch: { [noteKey(id)]: note } } : { id: null, patch: {} };
}

export function editNotePatch(scene, id, text) {
  const n = scene.notes[id];
  return n ? { [noteKey(id)]: { ...n, text: String(text || '').slice(0, MAX_NOTE_LENGTH) } } : {};
}

export const removeNotePatch = (id) => ({ [noteKey(id)]: null });

export function makeModelScene() {
  return { m3Scene: { order: [] } };
}
