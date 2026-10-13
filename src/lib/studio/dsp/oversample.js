// 4x polyphase oversampler. One Kaiser-windowed sinc low-pass (128 taps,
// about 80 dB stopband from 0.56 of the base Nyquist up) serves as both the
// interpolation filter going up and the anti-alias filter coming down, so
// a non-linearity in between can create harmonics far above Nyquist that
// are removed before they fold back into the audible band.

export const FACTOR = 4;
const TAPS = 128;
const PHASE = TAPS / FACTOR;

function besselI0(x) {
  let sum = 1; let term = 1;
  for (let k = 1; k < 32; k++) { term *= (x / (2 * k)) ** 2; sum += term; }
  return sum;
}

function design() {
  const h = new Float64Array(TAPS);
  const beta = 8;
  const fc = 0.5 / FACTOR; // cutoff at the base Nyquist, in oversampled cycles/sample
  const mid = (TAPS - 1) / 2;
  let sum = 0;
  for (let i = 0; i < TAPS; i++) {
    const t = i - mid;
    const sinc = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t);
    const w = besselI0(beta * Math.sqrt(1 - (t / mid) ** 2)) / besselI0(beta);
    h[i] = sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < TAPS; i++) h[i] /= sum;
  return h;
}

const H = design();
// Polyphase split for the upsampler: phase p uses taps p, p+4, p+8 ...
const POLY = Array.from({ length: FACTOR }, (_, p) => Float64Array.from({ length: PHASE }, (_, k) => H[p + k * FACTOR] * FACTOR));

/** Mono up/down sampler with its own history; `latency` is in base-rate samples. */
export class Oversampler {
  constructor() {
    this.up = new Float64Array(PHASE * 2); // input history, doubled so reads never wrap
    this.upPos = 0;
    this.down = new Float64Array(TAPS * 2);
    this.downPos = 0;
    this.latency = (TAPS - 1) / FACTOR; // filter delay going up plus coming down
  }
  /** Push one base-rate sample, write FACTOR oversampled samples into `out`. */
  upsample(x, out) {
    const p = this.upPos;
    this.up[p] = x; this.up[p + PHASE] = x;
    this.upPos = p + 1 === PHASE ? 0 : p + 1;
    for (let ph = 0; ph < FACTOR; ph++) {
      const c = POLY[ph];
      let acc = 0;
      // Newest sample first: up[p] is x[n], up[p-1] is x[n-1] ...
      for (let k = 0; k < PHASE; k++) acc += c[k] * this.up[p - k + PHASE];
      out[ph] = acc;
    }
  }
  /** Take FACTOR oversampled samples, return one base-rate sample. */
  downsample(v) {
    let p = this.downPos;
    for (let k = 0; k < FACTOR; k++) {
      this.down[p] = v[k]; this.down[p + TAPS] = v[k];
      p = p + 1 === TAPS ? 0 : p + 1;
    }
    this.downPos = p;
    // p now points one past the newest sample; convolve over the last TAPS samples.
    let acc = 0;
    for (let k = 0; k < TAPS; k++) acc += H[k] * this.down[p + TAPS - 1 - k];
    return acc;
  }
}
