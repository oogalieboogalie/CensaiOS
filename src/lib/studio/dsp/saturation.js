import { Oversampler, FACTOR } from './oversample.js';
import { Biquad, designBiquad } from './biquad.js';
import { Smoother, dbToGain } from './util.js';

// Saturation at 4x oversampling. Three curves: tape (tanh, odd harmonics),
// tube (asymmetric, adds even harmonics) and clip (a hard knee softened by
// a cubic). Output is normalised so a full-scale input stays near full
// scale whatever the drive, then a tone low-pass and a dry/wet mix follow.

export const SATURATION_MODES = Object.freeze(['tape', 'tube', 'clip']);

export function shape(mode, x) {
  if (mode === 'tube') {
    // Positive half compresses harder than the negative one.
    return x >= 0 ? Math.tanh(x * 1.2) / 1.2 * 1.1 : Math.tanh(x * 0.8) / 0.8 * 0.9;
  }
  if (mode === 'clip') {
    if (x > 1) return 2 / 3;
    if (x < -1) return -2 / 3;
    return x - (x * x * x) / 3;
  }
  return Math.tanh(x);
}

export class Saturator {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.os = [new Oversampler(), new Oversampler()];
    this.dryDelay = [new Float64Array(64), new Float64Array(64)];
    this.dryPos = 0;
    this.lag = Math.round(this.os[0].latency);
    this.tone = new Biquad();
    this.dc = new Biquad(); // the tube curve is asymmetric, so it makes DC
    this.dc.setCoefs(designBiquad('lowcut', 10, 0, 0.71, sampleRate));
    this.drive = new Smoother(1, 30, sampleRate);
    this.norm = new Smoother(1, 30, sampleRate);
    this.mix = new Smoother(1, 20, sampleRate);
    this.out = new Smoother(1, 20, sampleRate);
    this.bufUp = new Float64Array(FACTOR);
    this.mode = 'tape';
    this.tail = 0.01;
    this.setParams({});
  }
  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    this.mode = SATURATION_MODES.includes(p.mode) ? p.mode : 'tape';
    const g = dbToGain(Math.max(0, n(p.drive, 12)));
    this.drive.set(g);
    this.norm.set(1 / Math.abs(shape(this.mode, g)));
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 100) / 100)));
    this.out.set(dbToGain(n(p.output, 0)));
    this.tone.setCoefs(designBiquad('highcut', Math.min(20000, Math.max(800, n(p.tone, 12000))), 0, 0.71, this.sr));
  }
  reset() { this.tone.reset(); this.dc.reset(); }
  process(L, R, n) {
    const up = this.bufUp; const mode = this.mode; const lag = this.lag;
    for (let i = 0; i < n; i++) {
      const drive = this.drive.next(); const norm = this.norm.next();
      for (let c = 0; c < 2; c++) {
        const buf = c === 0 ? L : R;
        const x = buf[i];
        this.os[c].upsample(x * drive, up);
        for (let k = 0; k < FACTOR; k++) up[k] = shape(mode, up[k]) * norm;
        const wet = this.os[c].downsample(up);
        // The dry path is delayed by the same filter latency so the mix doesn't comb.
        const dd = this.dryDelay[c];
        dd[this.dryPos] = x;
        const dry = dd[(this.dryPos - lag + 64) & 63];
        const m = this.mix.value;
        buf[i] = wet * m + dry * (1 - m);
      }
      this.dryPos = (this.dryPos + 1) & 63;
      this.mix.next();
    }
    this.tone.process(L, R, 0, n);
    this.dc.process(L, R, 0, n);
    for (let i = 0; i < n; i++) { const g = this.out.next(); L[i] *= g; R[i] *= g; }
  }
}
