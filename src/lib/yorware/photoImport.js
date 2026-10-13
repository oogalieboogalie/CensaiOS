// Turning files into library photos, in the browser: decode (camera raw files
// through their built-in JPEG, see photoRaw.js), shrink to a working copy and
// a grid thumbnail, and read the camera details with exifr (MIT; the full
// build, because the smaller ones cannot read raw files).
import { MAX_SOURCE_BYTES, THUMB_EDGE, WORK_EDGE } from './photoLibModel.js';
import { findEmbeddedJpegs, isRawName, orientationToRot } from './photoRaw.js';
import { makeCanvas, orient } from './photoRender.js';

export const PHOTO_ACCEPT = 'image/*,.arw,.cr2,.cr3,.crw,.dng,.nef,.nrw,.orf,.pef,.raf,.rw2,.rwl,.srw,.x3f,.3fr,.iiq,.erf,.mrw,.kdc,.dcr';

const PICK = ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'CreateDate', 'ISO', 'ExposureTime', 'FNumber', 'FocalLength', 'Orientation'];

/** Camera details we show, from exifr's output. */
export function metaFromExif(x = {}) {
  const taken = x.DateTimeOriginal || x.CreateDate;
  const make = String(x.Make || '').trim();
  const model = String(x.Model || '').trim();
  const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ');
  const meta = {
    taken: taken instanceof Date && Number.isFinite(taken.getTime()) ? taken.toISOString() : null,
    camera: camera || null,
    lens: x.LensModel ? String(x.LensModel).trim() : null,
    iso: Number(x.ISO) || null,
    shutter: Number(x.ExposureTime) || null,
    aperture: Number(x.FNumber) || null,
    focal: Number(x.FocalLength) || null,
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null));
}

async function readExif(bytes) {
  try {
    const exifr = (await import('exifr/dist/full.esm.mjs')).default;
    return (await exifr.parse(bytes, { pick: PICK, translateValues: false, reviveValues: true })) || {};
  } catch {
    return {};
  }
}

/** A downsized copy as a JPEG data URL, turned upright. */
function shrink(bitmap, edge, rot, quality) {
  const w = bitmap.naturalWidth || bitmap.width;
  const h = bitmap.naturalHeight || bitmap.height;
  const s = Math.min(1, edge / Math.max(w, h));
  const sideways = rot % 180 !== 0;
  const canvas = makeCanvas((sideways ? h : w) * s, (sideways ? w : h) * s);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(s, s);
  orient(ctx, w, h, rot, false);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { url: canvas.toDataURL('image/jpeg', quality), w: canvas.width, h: canvas.height };
}

async function decodeRaw(bytes) {
  for (const j of findEmbeddedJpegs(bytes).slice(0, 4)) {
    try {
      return await createImageBitmap(new Blob([bytes.subarray(j.start, j.end)], { type: 'image/jpeg' }), { imageOrientation: 'none' });
    } catch { /* try the next one */ }
  }
  throw new Error('has no picture inside this app can show yet.');
}

/** Make a library photo from a picture that is already decoded. */
export function photoFromBitmap(bitmap, { name, bytes = 0, raw = false, meta = {}, rot = 0 }) {
  const work = shrink(bitmap, WORK_EDGE, rot, 0.86);
  const thumb = shrink(bitmap, THUMB_EDGE, rot, 0.78);
  return { name, src: work.url, thumb: thumb.url, w: work.w, h: work.h, bytes, raw, meta };
}

/** One file to a photo, or throws a plain-words error. */
export async function photoFromFile(file) {
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`"${file.name}" is over ${MAX_SOURCE_BYTES / 1048576} MB.`);
  const raw = isRawName(file.name);
  if (!raw && file.type && !file.type.startsWith('image/')) throw new Error(`"${file.name}" is not a picture.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const exif = await readExif(bytes);
  let bitmap;
  try {
    bitmap = raw ? await decodeRaw(bytes) : await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    if (/\.hei[cf]$/i.test(file.name)) throw new Error(`"${file.name}" is an iPhone HEIC photo, which this browser can't open. On the iPhone, Settings > Camera > Formats > Most Compatible saves JPEGs.`);
    throw new Error(`"${file.name}" ${raw ? err.message : 'could not be opened as a picture.'}`);
  }
  try {
    return photoFromBitmap(bitmap, {
      name: file.name, bytes: file.size, raw, meta: metaFromExif(exif), rot: raw ? orientationToRot(exif.Orientation) : 0,
    });
  } finally {
    bitmap.close?.();
  }
}

/** Pictures already on the board (Image and generated image windows). */
export function boardPictures(wins = [], skipId) {
  const out = [];
  for (const w of wins) {
    if (!w || w.id === skipId) continue;
    const src = w.kind === 'genImage' ? w.generatedImage : w.src;
    if (typeof src === 'string' && /^(data:image\/|https?:\/\/)/.test(src)) {
      out.push({ src, name: w.title || w.filePath?.split(/[\\/]/).pop() || (w.kind === 'genImage' ? 'Generated image' : 'Board picture') });
    }
  }
  return out;
}

/** A short stand-in for a picture's address, so the same one isn't brought in twice. */
export function pictureKey(src) {
  const s = String(src || '');
  return s.length <= 300 ? s : `${s.length}:${s.slice(22, 86)}:${s.slice(-64)}`;
}

/** Load a board picture into a photo. Pictures from sites that block copying are skipped. */
export async function photoFromBoard({ src, name }) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`"${name}" could not be loaded.`));
    el.src = src;
  });
  try {
    return { ...photoFromBitmap(img, { name, bytes: 0 }), from: pictureKey(src) };
  } catch {
    throw new Error(`"${name}" comes from a site that doesn't allow copying it.`);
  }
}
