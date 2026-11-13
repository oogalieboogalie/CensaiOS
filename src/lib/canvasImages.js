// Pictures pasted or dropped onto the board (issue 1011): pick the images out
// of a clipboard or drop, shrink big ones so the board save stays small, and
// size the Image window to the picture.

export const MAX_EDGE = 1600; // longest side kept, in pixels
export const MAX_DATA_URL = 1_500_000; // about 1.1 MB of picture per window
const KEEP_AS_IS = new Set(['image/gif', 'image/svg+xml']); // animation and vectors survive
const WINDOW_WIDTH = 420;
const CHROME = 96; // title bar, the fit/open bar and the frame around the picture

/** Image files in a paste or drop, in order. */
export function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return [];
  const fromItems = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file' && String(item.type).startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (fromItems.length) return fromItems;
  return Array.from(dataTransfer.files || []).filter((file) => String(file.type).startsWith('image/'));
}

/** An image dragged from a web page arrives as a link, not a file. */
export function imageUrlFrom(dataTransfer) {
  if (!dataTransfer?.getData) return null;
  const raw = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';
  const url = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#'));
  if (!url || !/^https:\/\//i.test(url)) return null;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url) ? url : null;
}

/** Does this drag carry anything the board can turn into a picture? */
export function dragHasPicture(dataTransfer) {
  const types = Array.from(dataTransfer?.types || []);
  return types.includes('Files') || types.includes('text/uri-list');
}

/** True while someone is typing, so Ctrl+V pastes text there instead. */
export function isTypingTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName).toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(String(el.type).toLowerCase());
}

/** Window size for a picture of this shape, roughly 420 wide. */
export function windowSizeFor(width, height) {
  const ratio = width > 0 && height > 0 ? height / width : 0.75;
  const body = Math.min(640, Math.max(160, Math.round(WINDOW_WIDTH * ratio)));
  return { w: WINDOW_WIDTH, h: body + CHROME };
}

/** "Screenshot 2026-11-11.png" -> "Screenshot 2026-11-11"; a pasted screenshot -> "Pasted picture". */
export function titleFor(file) {
  const name = String(file?.name || '').replace(/\.[a-z0-9]+$/i, '').trim();
  return name && name.toLowerCase() !== 'image' ? name : 'Pasted picture';
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the picture'));
    reader.readAsDataURL(file);
  });
}

/**
 * The picture as a data URL plus its size. Big pictures are shrunk to
 * MAX_EDGE; PNGs stay PNG (sharp text in screenshots) unless that is still
 * too big, then JPEG. GIFs and SVGs are kept as they are when small enough.
 * Returns null when the picture can't be read or is too big to keep.
 */
export async function pictureFromFile(file) {
  if (KEEP_AS_IS.has(file.type)) {
    if (file.size > MAX_DATA_URL * 0.7) return null;
    const src = await readAsDataUrl(file);
    const dims = await measure(src);
    return { src, ...dims };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_DATA_URL * 0.7) {
      return { src: await readAsDataUrl(file), width: bitmap.width, height: bitmap.height };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let src = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
    if (src.length > MAX_DATA_URL) src = canvas.toDataURL('image/jpeg', 0.82);
    if (src.length > MAX_DATA_URL) return null;
    return { src, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close?.();
  }
}

function measure(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}
