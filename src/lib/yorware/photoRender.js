// Browser side of YorWare Photos: draw a photo with its develop settings
// (turn, mirror, crop, then the colour math in photoAdjust.js) onto a canvas.
// The screen, the grid and the exported file all use drawDeveloped, so what
// you see is what you save.
import { adjustPixels } from './photoAdjust.js';
import { normalizeEdits, outputSize } from './photoLibModel.js';

const images = new Map();
const KEEP = 24;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** A decoded picture for a data URL, kept for the most recent few. */
export function loadImage(src) {
  if (images.has(src)) {
    const hit = images.get(src);
    images.delete(src);
    images.set(src, hit);
    return hit;
  }
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That picture could not be drawn.'));
    img.src = src;
  });
  images.set(src, p);
  p.catch(() => images.delete(src));
  while (images.size > KEEP) images.delete(images.keys().next().value);
  return p;
}

/** Set up ctx so drawing the source at (0,0,w,h) lands turned and mirrored. */
export function orient(ctx, w, h, rot, flip) {
  const tw = rot % 180 ? h : w;
  const th = rot % 180 ? w : h;
  if (flip) { ctx.translate(tw, 0); ctx.scale(-1, 1); }
  if (rot === 90) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
  if (rot === 180) { ctx.translate(w, h); ctx.rotate(Math.PI); }
  if (rot === 270) { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
  return { tw, th };
}

/**
 * The developed photo on a new canvas, its long side at most `maxEdge`.
 * `skipCrop` shows the whole turned picture (the crop tool draws the box).
 */
export function drawDeveloped(img, rawEdits, { maxEdge = Infinity, skipCrop = false, adjust = true } = {}) {
  const e = normalizeEdits(rawEdits);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const crop = skipCrop ? null : e.crop;
  const out = outputSize({ w, h }, { ...e, crop });
  const s = Math.min(1, maxEdge / Math.max(out.w, out.h));
  const canvas = makeCanvas(out.w * s, out.h * s);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(canvas.width / out.w, canvas.height / out.h);
  const tw = e.rot % 180 ? h : w;
  const th = e.rot % 180 ? w : h;
  if (crop) ctx.translate(-crop.x * tw, -crop.y * th);
  orient(ctx, w, h, e.rot, e.flip);
  ctx.drawImage(img, 0, 0, w, h);
  if (adjust) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    adjustPixels(data.data, e);
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not make the file.'))), type, quality);
  });
}

/** The finished file for one photo: JPEG or PNG bytes at full working size. */
export async function exportPhoto(photo, edits, type = 'image/jpeg') {
  const img = await loadImage(photo.src);
  const canvas = drawDeveloped(img, edits);
  const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
  return new Uint8Array(await blob.arrayBuffer());
}
