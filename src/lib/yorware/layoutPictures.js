// Turning a picture from your computer into one the board can hold and the
// PDF can embed: PNG and JPEG go in as they are (if small enough); anything
// else (WebP, GIF, HEIC the browser can read) and anything very large is
// redrawn as a JPEG (or a PNG when it has see-through parts) no wider than
// 2400 pixels, about 8 inches at 300 dots per inch.
import { MAX_IMAGE_BYTES } from './layoutModel.js';
import { bytesToBase64 } from './pdfBytes.js';

const MAX_SIDE = 2400;

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture this browser can open.')); };
    img.src = url;
  });
}

function hasClearPixels(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 250) return true;
  return false;
}

/** { name, data (base64), mime, w, h, bytes } for a File, ready for addImagePatch. */
export async function readPicture(file) {
  if (!file) throw new Error('No picture was chosen.');
  const { img, url } = await decode(file);
  try {
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('That picture has no size.');
    const direct = (file.type === 'image/png' || file.type === 'image/jpeg') && file.size <= MAX_IMAGE_BYTES && Math.max(w0, h0) <= MAX_SIDE * 1.5;
    if (direct) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { name: file.name, data: bytesToBase64(bytes), mime: file.type, w: w0, h: h0, bytes: bytes.length };
    }
    const s = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const mime = file.type !== 'image/jpeg' && hasClearPixels(ctx, w, h) ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.88));
    if (!blob) throw new Error('The picture could not be prepared.');
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`"${file.name}" is still ${(blob.size / 1048576).toFixed(1)} MB after shrinking. Pictures up to ${MAX_IMAGE_BYTES / 1048576} MB fit on the board.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { name: file.name, data: bytesToBase64(bytes), mime, w, h, bytes: bytes.length };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickPicture() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}
