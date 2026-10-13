// WAV (RIFF PCM) encoding for the mix export. 24-bit by default; 16-bit gets
// TPDF dither so quiet fades don't turn to grit.

export function encodeWav({ left, right }, sampleRate, bits = 24) {
  const frames = left.length;
  const bytes = bits / 8;
  const dataLen = frames * 2 * bytes;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2 * bytes, true);
  v.setUint16(32, 2 * bytes, true); v.setUint16(34, bits, true);
  text(36, 'data'); v.setUint32(40, dataLen, true);
  const max = bits === 16 ? 32767 : 8388607;
  let seed = 22222;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of [left, right]) {
      let s = Math.max(-1, Math.min(1, ch[i])) * max;
      if (bits === 16) s += rand() - rand();
      const q = Math.max(-max - 1, Math.min(max, Math.round(s)));
      if (bits === 16) v.setInt16(o, q, true);
      else { v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); }
      o += bytes;
    }
  }
  return buf;
}

/** Reads a PCM WAV back into float channels (tests, and importing renders). */
export function decodeWav(buf) {
  const v = new DataView(buf);
  const channels = v.getUint16(22, true); const sampleRate = v.getUint32(24, true); const bits = v.getUint16(34, true);
  let o = 12;
  while (o < v.byteLength - 8) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const size = v.getUint32(o + 4, true);
    if (id === 'data') { o += 8; break; }
    o += 8 + size;
  }
  const bytes = bits / 8; const frames = Math.floor((v.byteLength - o) / (bytes * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = o + (i * channels + c) * bytes;
      let s;
      if (bits === 16) s = v.getInt16(p, true) / 32768;
      else { s = (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 8388608; }
      out[c][i] = s;
    }
  }
  return { sampleRate, channels: out };
}
