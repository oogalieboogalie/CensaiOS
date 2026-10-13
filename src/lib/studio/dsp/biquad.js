// Biquad filters from the RBJ Audio EQ Cookbook, run in transposed direct
// form II with double precision state (Float64), which stays clean at low
// frequencies where single precision biquads hiss and drift.

export const FILTER_TYPES = Object.freeze(['lowcut', 'lowshelf', 'peak', 'highshelf', 'highcut']);

/** Normalised coefficients { b0, b1, b2, a1, a2 } for one band. */
export function designBiquad(type, freq, gainDb, q, sampleRate) {
  const f = Math.min(Math.max(freq, 10), sampleRate * 0.49);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const Q = Math.max(q, 0.1);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sin / (2 * Q);
  let b0; let b1; let b2; let a0; let a1; let a2;
  switch (type) {
    case 'lowcut':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'highcut':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'lowshelf': {
      // Shelf slope S = 1 when q is left at its 0.707 default.
      const sa = 2 * Math.sqrt(A) * (sin / 2) * Math.sqrt(Math.max(0, (A + 1 / A) * (1 / Math.min(Q / 0.7071, 1) - 1) + 2));
      b0 = A * ((A + 1) - (A - 1) * cos + sa);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - sa);
      a0 = (A + 1) + (A - 1) * cos + sa;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - sa;
      break;
    }
    case 'highshelf': {
      const sa = 2 * Math.sqrt(A) * (sin / 2) * Math.sqrt(Math.max(0, (A + 1 / A) * (1 / Math.min(Q / 0.7071, 1) - 1) + 2));
      b0 = A * ((A + 1) + (A - 1) * cos + sa);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - sa);
      a0 = (A + 1) - (A - 1) * cos + sa;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - sa;
      break;
    }
    default: // peak
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Magnitude response in dB of one biquad at `freq` (used by tests and the EQ curve). */
export function biquadMagnitudeDb(c, freq, sampleRate) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cos1 = Math.cos(w); const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w); const sin2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const ni = -(c.b1 * sin1 + c.b2 * sin2);
  const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
  const di = -(c.a1 * sin1 + c.a2 * sin2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** Stereo biquad section. Coefficients can change between blocks without resetting state. */
export class Biquad {
  constructor() {
    this.c = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    this.s = new Float64Array(4); // z1, z2 for left then right
  }
  setCoefs(c) { this.c = c; }
  reset() { this.s.fill(0); }
  process(L, R, from, to) {
    const { b0, b1, b2, a1, a2 } = this.c;
    const s = this.s;
    let z1 = s[0]; let z2 = s[1]; let y1 = s[2]; let y2 = s[3];
    for (let i = from; i < to; i++) {
      const xl = L[i];
      const yl = b0 * xl + z1;
      z1 = b1 * xl - a1 * yl + z2;
      z2 = b2 * xl - a2 * yl;
      L[i] = yl;
      const xr = R[i];
      const yr = b0 * xr + y1;
      y1 = b1 * xr - a1 * yr + y2;
      y2 = b2 * xr - a2 * yr;
      R[i] = yr;
    }
    // Flush denormals so silence after a loud passage costs nothing.
    s[0] = Math.abs(z1) < 1e-20 ? 0 : z1; s[1] = Math.abs(z2) < 1e-20 ? 0 : z2;
    s[2] = Math.abs(y1) < 1e-20 ? 0 : y1; s[3] = Math.abs(y2) < 1e-20 ? 0 : y2;
  }
}
