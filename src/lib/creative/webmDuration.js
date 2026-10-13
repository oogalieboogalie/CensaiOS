// Browsers record WebM without a length (MediaRecorder streams it), so
// players show no seek bar. This writes the Duration into the file's Segment
// Info, the same fix desktop tools apply. Files it can't safely patch are
// returned unchanged.

const INFO = [0x15, 0x49, 0xa9, 0x66];
const DURATION = [0x44, 0x89];

function find(bytes, id, from = 0, to = bytes.length) {
  for (let i = from; i <= to - id.length; i += 1) {
    if (id.every((b, k) => bytes[i + k] === b)) return i;
  }
  return -1;
}

/** An EBML size: { len, value } from the byte at `at`. */
function readSize(bytes, at) {
  const first = bytes[at];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len += 1;
  if (len > 8) return null;
  let value = first & (0xff >> len);
  for (let k = 1; k < len; k += 1) value = value * 256 + bytes[at + k];
  return { len, value };
}

function writeSize(value, len) {
  const out = new Uint8Array(len);
  let v = value;
  for (let k = len - 1; k >= 0; k -= 1) { out[k] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 0x80 >> (len - 1);
  return out;
}

/** A copy of `bytes` (Uint8Array) with Duration set to `ms` milliseconds. */
export function patchWebmDuration(bytes, ms) {
  const at = find(bytes, INFO, 0, Math.min(bytes.length, 4096));
  if (at < 0) return bytes;
  const size = readSize(bytes, at + 4);
  if (!size) return bytes;
  const body = at + 4 + size.len;
  if (find(bytes, DURATION, body, body + size.value) >= 0) return bytes;
  const grown = size.value + 11;
  if (grown >= 2 ** (7 * size.len) - 1) return bytes;
  const dur = new Uint8Array(11);
  dur.set([...DURATION, 0x88]);
  new DataView(dur.buffer).setFloat64(3, ms);
  const out = new Uint8Array(bytes.length + 11);
  out.set(bytes.subarray(0, at + 4));
  out.set(writeSize(grown, size.len), at + 4);
  out.set(bytes.subarray(body, body + size.value), body);
  out.set(dur, body + size.value);
  out.set(bytes.subarray(body + size.value), body + size.value + 11);
  return out;
}
