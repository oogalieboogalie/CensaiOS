// Images in Censai Office files are data URLs kept in board state, so they
// sync and export with no server. Pictures are scaled down on the way in so
// a few of them don't bloat the board.

export const MAX_IMAGE_EDGE = 1600;

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

/** "data:image/png;base64,…" -> { type: 'png', mime, bytes } or null. */
export function dataUrlBytes(src) {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(src || ''));
  if (!m || !TYPES[m[1].toLowerCase()]) return null;
  const bin = atob(m[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { type: TYPES[m[1].toLowerCase()], mime: m[1].toLowerCase(), bytes };
}

/** Fit an image inside a max width, keeping its shape. */
export function fitImage(w, h, maxW, maxH = Infinity) {
  const width = Number(w) > 0 ? Number(w) : maxW;
  const height = Number(h) > 0 ? Number(h) : Math.round(maxW * 0.5625);
  const scale = Math.min(1, maxW / width, maxH / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a picture this browser can read.'));
    img.src = url;
  });
}

/** Browser only: a picked or pasted image file -> { src, w, h, alt }. */
export async function readImageFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pick a PNG, JPEG or GIF picture.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { width, height } = fitImage(img.naturalWidth, img.naturalHeight, MAX_IMAGE_EDGE, MAX_IMAGE_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const keepPng = file.type === 'image/png' && width * height < 600 * 600;
    const ctx = canvas.getContext('2d');
    if (!keepPng) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const src = canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.86);
    return { src, w: width, h: height, alt: String(file.name || 'image').replace(/\.[a-z0-9]+$/i, '') };
  } finally {
    URL.revokeObjectURL(url);
  }
}
