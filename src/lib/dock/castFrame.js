// Browser-only: turns the shell's raw pixels into small images.
import { MAX_FRAME_CHARS, bgraToRgba, bgraToRgbaKeepAlpha, readCapture } from './wire.js';

function paint(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

function shrink(source, width) {
  const height = Math.max(1, Math.round(source.height * (width / source.width)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * A JPEG data URL small enough for the collaboration socket, or null. Tries
 * lower quality first, then a smaller picture.
 */
export function encodeCastFrame(buffer) {
  const capture = readCapture(buffer);
  if (!capture) return null;
  return encodeCanvasFrame(paint(capture.width, capture.height, bgraToRgba(capture.bgra)));
}

/** Same, from a canvas already on the page (a VM window's screen). */
export function encodeCanvasFrame(source) {
  if (!source?.width || !source?.height) return null;
  let canvas = source;
  for (const width of [Math.min(canvas.width, 640), 400, 320, 240]) {
    if (width > canvas.width) continue;
    if (width < canvas.width) canvas = shrink(canvas, width);
    for (const quality of [0.6, 0.45, 0.32]) {
      const frame = canvas.toDataURL('image/jpeg', quality);
      if (frame.length <= MAX_FRAME_CHARS) return { frame, width: canvas.width, height: canvas.height };
    }
  }
  return null;
}

/** A window icon (32x32 BGRA, base64) as a PNG data URL, or null. */
export function iconDataUrl(base64) {
  if (!base64) return null;
  try {
    const raw = atob(base64);
    if (raw.length !== 32 * 32 * 4) return null;
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return paint(32, 32, bgraToRgbaKeepAlpha(bytes)).toDataURL('image/png');
  } catch {
    return null;
  }
}
