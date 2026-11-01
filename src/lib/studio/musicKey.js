// The song's key and scale, and the note helpers that use them: which piano
// roll rows are in the key, moving stray notes onto the scale, lining notes
// up with the grid, and guessing a key from a melody (for a hummed take).

export const KEY_NAMES = Object.freeze(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
export const SCALES = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  minor: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
});
export const SCALE_NAMES = Object.freeze(Object.keys(SCALES));

const pc = p => ((Math.round(p) % 12) + 12) % 12;

export const keyLabel = (key, scale) => `${KEY_NAMES[pc(key)]} ${scale === 'minor' ? 'minor' : 'major'}`;

export function inScale(pitch, key = 0, scale = 'major') {
  return (SCALES[scale] || SCALES.major).includes(pc(pitch - key));
}

/** The nearest pitch in the scale; a tie goes down, which keeps a hummed line from creeping up. */
export function nearestInScale(pitch, key = 0, scale = 'major') {
  const p = Math.round(pitch);
  for (let step = 0; step <= 6; step++) {
    if (inScale(p - step, key, scale)) return p - step;
    if (inScale(p + step, key, scale)) return p + step;
  }
  return p;
}

/** Every note moved onto the scale. Notes already in it stay where they are. */
export function fitToScale(notes, key = 0, scale = 'major') {
  return notes.map(n => ({ ...n, p: Math.max(0, Math.min(127, nearestInScale(n.p, key, scale))) }));
}

/** Starts and lengths on the grid; two notes of one pitch that land on one step become one. */
export function quantizeNotes(notes, step = 0.25, len = Infinity) {
  if (!(step > 0)) return notes.slice();
  const seen = new Set();
  const out = [];
  for (const n of notes) {
    const t = Math.max(0, Math.round(n.t / step) * step);
    if (t >= len) continue;
    const id = `${n.p}@${t}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = Math.max(step, Math.round(n.d / step) * step);
    out.push({ ...n, t, d: Math.min(d, len - t) });
  }
  return out;
}

// Krumhansl-Kessler key profiles: how strongly each scale step belongs to a major or minor key.
const PROFILES = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

function correlation(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** The key a melody most likely sits in, weighted by how long each note lasts. Null with too few notes. */
export function guessKey(notes) {
  if (!Array.isArray(notes) || notes.length < 3) return null;
  const weight = new Array(12).fill(0);
  for (const n of notes) weight[pc(n.p)] += Math.max(0.05, n.d || 0.25);
  let best = null;
  for (const scale of SCALE_NAMES) {
    for (let key = 0; key < 12; key++) {
      const rotated = weight.map((_, i) => weight[(i + key) % 12]);
      const score = correlation(rotated, PROFILES[scale]);
      if (!best || score > best.score) best = { key, scale, score };
    }
  }
  return best;
}
