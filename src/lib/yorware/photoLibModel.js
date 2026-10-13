// How a YorWare Photos window lives in board state. Like YorWare PDF, each
// piece is its own window field, so one person rating a photo and another
// developing it at the same moment merge instead of overwriting each other.
// A removed piece is set to null (undefined is skipped by the sync).
//
//   phLib         { order: [photoId…] }                       grid order
//   ph.<photoId>  { name, src, thumb, w, h, bytes, raw, meta, at }  the picture (never changes)
//   pr.<photoId>  { stars, flag, tags }                       rating and tags
//   pe.<photoId>  { exposure, contrast, …, rot, flip, crop }  develop settings
//
// `src` is a JPEG working copy (long side up to WORK_EDGE pixels) and `thumb`
// a small one for the grid. Edits never touch either: they are a recipe the
// screen and the export apply on the way out, so "Reset" always gets the
// original back.
import { newPartId, orderedIds, readParts } from '../office/officeParts.js';

export const PHOTO_PART = Object.freeze({ photo: 'ph', rating: 'pr', edit: 'pe' });
export const WORK_EDGE = 2048;
export const THUMB_EDGE = 320;
// Every picture lives on the board, which every teammate downloads.
export const MAX_PHOTOS = 60;
export const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
export const FLAGS = Object.freeze(['pick', 'reject']);

export const photoKey = (id) => `${PHOTO_PART.photo}.${id}`;
export const ratingKey = (id) => `${PHOTO_PART.rating}.${id}`;
export const editKey = (id) => `${PHOTO_PART.edit}.${id}`;

/** Develop sliders: [field, label, min, max, step]. All start at 0. */
export const SLIDERS = Object.freeze([
  ['exposure', 'Exposure', -3, 3, 0.05],
  ['contrast', 'Contrast', -100, 100, 1],
  ['highlights', 'Highlights', -100, 100, 1],
  ['shadows', 'Shadows', -100, 100, 1],
  ['temp', 'Warmth', -100, 100, 1],
  ['tint', 'Tint', -100, 100, 1],
  ['vibrance', 'Vibrance', -100, 100, 1],
  ['saturation', 'Saturation', -100, 100, 1],
]);

export const EMPTY_EDITS = Object.freeze({
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0,
  rot: 0, flip: false, crop: null,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Fill in missing develop fields and keep every value in range. */
export function normalizeEdits(raw) {
  const e = { ...EMPTY_EDITS, ...(raw || {}) };
  for (const [key, , min, max] of SLIDERS) e[key] = clamp(Number(e[key]) || 0, min, max);
  e.rot = ((Math.round((Number(e.rot) || 0) / 90) * 90) % 360 + 360) % 360;
  e.flip = Boolean(e.flip);
  e.crop = normalizeCrop(e.crop);
  return e;
}

/** A crop is a box in 0..1 of the turned picture; anything covering it all is "no crop". */
export function normalizeCrop(crop) {
  if (!crop) return null;
  const x = clamp(Number(crop.x) || 0, 0, 0.98);
  const y = clamp(Number(crop.y) || 0, 0, 0.98);
  const w = clamp(Number(crop.w) || 1, 0.02, 1 - x);
  const h = clamp(Number(crop.h) || 1, 0.02, 1 - y);
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

/** True when the photo has any develop change at all. */
export function isEdited(edits) {
  const e = normalizeEdits(edits);
  return SLIDERS.some(([k]) => e[k] !== 0) || e.rot !== 0 || e.flip || Boolean(e.crop);
}

export function normalizeRating(raw) {
  const stars = clamp(Math.round(Number(raw?.stars) || 0), 0, 5);
  const flag = FLAGS.includes(raw?.flag) ? raw.flag : null;
  const tags = [...new Set((Array.isArray(raw?.tags) ? raw.tags : []).map(cleanTag).filter(Boolean))];
  return { stars, flag, tags };
}

export function cleanTag(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32);
}

/** Everything the window needs, read from the window record. */
export function readLibrary(win) {
  const photos = readParts(win, PHOTO_PART.photo);
  const order = orderedIds(win?.phLib?.order, photos);
  const ratings = {};
  const edits = {};
  const rawRatings = readParts(win, PHOTO_PART.rating);
  const rawEdits = readParts(win, PHOTO_PART.edit);
  for (const id of order) {
    ratings[id] = normalizeRating(rawRatings[id]);
    edits[id] = normalizeEdits(rawEdits[id]);
  }
  return { photos, order, ratings, edits };
}

/** The patch that adds pictures (already decoded) to the end of the grid. */
export function addPhotosPatch(lib, items, now = Date.now()) {
  const room = Math.max(0, MAX_PHOTOS - lib.order.length);
  const ids = [];
  const patch = {};
  items.slice(0, room).forEach((item, i) => {
    const id = newPartId('ph');
    patch[photoKey(id)] = {
      name: String(item.name || 'Photo'), src: item.src, thumb: item.thumb || item.src,
      w: item.w, h: item.h, bytes: item.bytes || 0, raw: Boolean(item.raw), meta: item.meta || {}, at: now + i,
      ...(item.from ? { from: item.from } : {}),
    };
    if (item.edits) patch[editKey(id)] = normalizeEdits(item.edits);
    ids.push(id);
  });
  if (ids.length) patch.phLib = { order: [...lib.order, ...ids] };
  return { ids, patch, skipped: items.length - ids.length };
}

export function removePhotosPatch(lib, ids) {
  const gone = new Set(ids);
  const patch = { phLib: { order: lib.order.filter((id) => !gone.has(id)) } };
  for (const id of gone) {
    patch[photoKey(id)] = null;
    patch[ratingKey(id)] = null;
    patch[editKey(id)] = null;
  }
  return patch;
}

export function ratingPatch(lib, id, change) {
  return { [ratingKey(id)]: normalizeRating({ ...lib.ratings[id], ...change }) };
}

export function editPatch(lib, id, change) {
  return { [editKey(id)]: normalizeEdits({ ...lib.edits[id], ...change }) };
}

/** Copy one photo's develop settings onto others (crop and turn stay theirs). */
export function pasteEditsPatch(lib, fromId, toIds) {
  const { rot, flip, crop, ...look } = lib.edits[fromId] || EMPTY_EDITS;
  const patch = {};
  for (const id of toIds) if (id !== fromId && lib.photos[id]) Object.assign(patch, editPatch(lib, id, look));
  return patch;
}

/** Turn a quarter turn; a crop turns with the picture. */
export function rotatePatch(lib, id, dir = 1) {
  const e = lib.edits[id] || EMPTY_EDITS;
  const c = e.crop;
  const crop = !c ? null : dir > 0 ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
  return editPatch(lib, id, { rot: e.rot + (dir > 0 ? 90 : -90), crop });
}

/** Size of the photo after turning and cropping, in working-copy pixels. */
export function outputSize(photo, edits) {
  const e = normalizeEdits(edits);
  const sideways = e.rot % 180 !== 0;
  const w = sideways ? photo.h : photo.w;
  const h = sideways ? photo.w : photo.h;
  const c = e.crop || { w: 1, h: 1 };
  return { w: Math.max(1, Math.round(w * c.w)), h: Math.max(1, Math.round(h * c.h)) };
}

export function makePhotoLib() {
  return { phLib: { order: [] } };
}
