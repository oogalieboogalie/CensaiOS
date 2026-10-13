// Small DSP helpers shared by every Studio processor. Pure functions and
// classes only, so the same code runs in the audio worklet, in the WAV
// export and in Node tests.

export const dbToGain = (db) => (db <= -120 ? 0 : Math.pow(10, db / 20));
export const gainToDb = (g) => (g <= 1e-6 ? -120 : 20 * Math.log10(g));
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** One-pole coefficient that reaches ~63% of a step in `ms`. */
export function msToCoef(ms, sampleRate) {
  return ms <= 0 ? 0 : Math.exp(-1 / (ms * 0.001 * sampleRate));
}

/**
 * Exponential parameter smoother. Every audible parameter goes through one
 * so knob moves and automation never step (steps are what clicks).
 */
export class Smoother {
  constructor(value, ms, sampleRate) {
    this.value = value;
    this.target = value;
    this.coef = msToCoef(ms, sampleRate);
  }
  set(target) { this.target = target; }
  snap(value = this.target) { this.value = value; this.target = value; }
  next() {
    const v = this.target + (this.value - this.target) * this.coef;
    this.value = Math.abs(v - this.target) < 1e-7 ? this.target : v;
    return this.value;
  }
  /** Advance n samples at once (for control-rate parameters). */
  skip(n) {
    if (this.value === this.target) return this.value;
    const v = this.target + (this.value - this.target) * Math.pow(this.coef, n);
    this.value = Math.abs(v - this.target) < 1e-7 ? this.target : v;
    return this.value;
  }
  get settled() { return this.value === this.target; }
}

/** Deterministic PRNG (mulberry32) so generated impulses are identical everywhere. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4-point Hermite read from a circular buffer at a fractional delay. */
export function hermite(buf, mask, write, delay) {
  const pos = write - delay;
  const i = Math.floor(pos);
  const f = pos - i;
  const xm1 = buf[(i - 1) & mask];
  const x0 = buf[i & mask];
  const x1 = buf[(i + 1) & mask];
  const x2 = buf[(i + 2) & mask];
  const c1 = 0.5 * (x1 - xm1);
  const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
  const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}

export function pow2Above(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Tempo-synced note lengths, in beats (quarter notes). */
export const DIVISIONS = Object.freeze({
  '1/2': 2, '1/4d': 1.5, '1/4': 1, '1/4t': 2 / 3, '1/8d': 0.75, '1/8': 0.5, '1/8t': 1 / 3, '1/16': 0.25, '1/16t': 1 / 6, '1/32': 0.125,
});
