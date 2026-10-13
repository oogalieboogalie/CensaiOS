// Camera raw files in YorWare Photos. Every common raw format (Canon CR2 and
// CR3, Nikon NEF, Sony ARW, Adobe DNG, Fujifilm RAF, Olympus ORF, Panasonic
// RW2, Pentax PEF) carries the camera's own full-size or large JPEG of the
// shot next to the sensor data. We find the biggest one and develop from it
// (exposure, white balance, tone, colour, crop), with no download and no
// extra library. Decoding the sensor data itself needs LibRaw, which comes
// later (see docs/specs/13-yorware-suite.md, "Photo library").

export const RAW_EXTENSIONS = Object.freeze([
  'arw', 'cr2', 'cr3', 'crw', 'dng', 'nef', 'nrw', 'orf', 'pef', 'raf', 'rw2', 'rwl', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'mrw', 'kdc', 'dcr',
]);

export function isRawName(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  return RAW_EXTENSIONS.includes(ext);
}

// Start-of-frame markers a browser can draw: baseline, extended, progressive.
// Lossless JPEG (C3), which raw files use for sensor data, is left out.
const DRAWABLE_SOF = new Set([0xc0, 0xc1, 0xc2]);
const STANDALONE = (m) => m === 0x01 || (m >= 0xd0 && m <= 0xd7);

/**
 * Walk one JPEG from its start marker. Returns { end, w, h, drawable } with
 * `end` just past its end marker, or null when the bytes are not a JPEG.
 */
export function walkJpeg(bytes, start) {
  const n = bytes.length;
  if (bytes[start] !== 0xff || bytes[start + 1] !== 0xd8) return null;
  let i = start + 2;
  let w = 0; let h = 0; let drawable = false; let sawFrame = false;
  while (i + 1 < n) {
    if (bytes[i] !== 0xff) return null;
    let m = bytes[i + 1];
    while (m === 0xff && i + 2 < n) { i += 1; m = bytes[i + 1]; }
    if (m === 0xd9) return sawFrame ? { end: i + 2, w, h, drawable } : null;
    if (STANDALONE(m)) { i += 2; continue; }
    if (i + 3 >= n) return null;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 8 >= n) return null;
      sawFrame = true;
      drawable = DRAWABLE_SOF.has(m);
      h = (bytes[i + 5] << 8) | bytes[i + 6];
      w = (bytes[i + 7] << 8) | bytes[i + 8];
    }
    i += 2 + len;
    if (m === 0xda) {
      // Compressed data runs until a marker that is not a stuffed 00 or a restart.
      while (i + 1 < n && !(bytes[i] === 0xff && bytes[i + 1] !== 0x00 && !(bytes[i + 1] >= 0xd0 && bytes[i + 1] <= 0xd7))) i += 1;
      if (i + 1 >= n) return null;
    }
  }
  return null;
}

/**
 * Every drawable JPEG inside a file, biggest first: [{ start, end, w, h }].
 * After a whole JPEG is found the search skips past it, so a 50 MB raw file
 * is read about once.
 */
export function findEmbeddedJpegs(bytes, { minEdge = 160 } = {}) {
  const found = [];
  const n = bytes.length;
  let i = 0;
  while (i + 2 < n) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      const j = walkJpeg(bytes, i);
      if (j) {
        if (j.drawable && Math.max(j.w, j.h) >= minEdge) found.push({ start: i, end: j.end, w: j.w, h: j.h });
        i = j.end;
        continue;
      }
    }
    i += 1;
  }
  return found.sort((a, b) => b.w * b.h - a.w * a.h);
}

/** Quarter turns for an EXIF orientation value (1, 3, 6, 8; mirrored ones count as their turn). */
export function orientationToRot(orientation) {
  const o = Number(orientation) || 1;
  if (o === 3 || o === 4) return 180;
  if (o === 6 || o === 5) return 90;
  if (o === 8 || o === 7) return 270;
  return 0;
}
