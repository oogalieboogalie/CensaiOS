// PDF bytes on the board are base64 text (board fields are JSON).

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(u8).toString('base64');
  let out = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) out += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  return btoa(out);
}

export function base64ToBytes(text) {
  if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when the bytes start like a PDF ("%PDF-"), allowing a little junk first. */
export function looksLikePdf(bytes) {
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}
