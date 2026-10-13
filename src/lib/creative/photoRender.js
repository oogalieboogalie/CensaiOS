// Browser side of Censai Photo: decode layer pixels, composite the layers
// (blend modes, opacity, adjustments) and export PNG, JPEG or WebP. The same
// compositor draws the screen and the exported file, so they always match.
import { filterString } from './photoModel.js';

export const TEXT_FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a picture this browser can read.'));
    img.src = src;
  });
}

/** A layer's pixels as a canvas: decoded from its data URL, or blank. */
export async function layerSurface(layer, doc) {
  const w = layer.w || doc.w;
  const h = layer.h || doc.h;
  if (!layer.src) return makeCanvas(w, h);
  const img = await loadImage(layer.src);
  const c = makeCanvas(img.naturalWidth || w, img.naturalHeight || h);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

/** Encode a layer's pixels for the board. Photos go lossy WebP, drawings PNG. */
export function encodeSurface(canvas, fmt = 'png') {
  return fmt === 'webp' ? canvas.toDataURL('image/webp', 0.9) : canvas.toDataURL('image/png');
}

function textLines(layer) {
  return String(layer.text ?? '').split('\n');
}

/** The box a text layer covers, in document pixels. */
export function textBox(ctx, layer) {
  ctx.save();
  ctx.font = `${layer.weight || 600} ${layer.size || 64}px ${TEXT_FONT}`;
  const lines = textLines(layer);
  const w = Math.max(8, ...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { x: layer.x || 0, y: layer.y || 0, w, h: lines.length * (layer.size || 64) * 1.2 };
}

export function drawText(ctx, layer) {
  const size = layer.size || 64;
  ctx.font = `${layer.weight || 600} ${size}px ${TEXT_FONT}`;
  ctx.fillStyle = layer.color || '#111111';
  ctx.textBaseline = 'top';
  textLines(layer).forEach((line, i) => ctx.fillText(line, layer.x || 0, (layer.y || 0) + i * size * 1.2));
}

/**
 * Draw the whole document into ctx at 1:1. `surfaces` maps layer id → canvas;
 * `live` swaps in a canvas for a layer mid-stroke; `moving` offsets one
 * layer while it is dragged.
 */
export function composite(ctx, doc, surfaces, { live = {}, moving = null, background = true } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, doc.w, doc.h);
  if (background && doc.bg) {
    ctx.fillStyle = doc.bg;
    ctx.fillRect(0, 0, doc.w, doc.h);
  }
  for (const id of doc.order) {
    const layer = doc.layers[id];
    if (!layer || layer.visible === false) continue;
    const dx = moving?.id === id ? moving.dx : 0;
    const dy = moving?.id === id ? moving.dy : 0;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
    ctx.globalCompositeOperation = layer.blend || 'source-over';
    ctx.filter = filterString(layer.adj);
    if (layer.kind === 'text') {
      drawText(ctx, { ...layer, x: (layer.x || 0) + dx, y: (layer.y || 0) + dy });
    } else {
      const surface = live[id] || surfaces[id];
      if (surface) ctx.drawImage(surface, (layer.x || 0) + dx, (layer.y || 0) + dy);
    }
    ctx.restore();
  }
  ctx.restore();
}

export const PHOTO_FORMATS = Object.freeze({
  png: { mime: 'image/png', label: 'PNG', hint: 'Lossless, keeps transparency' },
  jpg: { mime: 'image/jpeg', label: 'JPEG', hint: 'Small, for photos', quality: 0.92 },
  webp: { mime: 'image/webp', label: 'WebP', hint: 'Small, keeps transparency', quality: 0.9 },
});

/** The flattened document as an image file Blob. */
export function exportPhoto(doc, surfaces, ext = 'png') {
  const f = PHOTO_FORMATS[ext] || PHOTO_FORMATS.png;
  const c = makeCanvas(doc.w, doc.h);
  const ctx = c.getContext('2d');
  composite(ctx, doc, surfaces, { background: true });
  if (ext === 'jpg' && !doc.bg) {
    // JPEG has no transparency: paint white under the layers.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, doc.w, doc.h);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('This browser could not make that file.'))), f.mime, f.quality));
}
