import { Smoother, hermite, msToCoef, pow2Above } from './util.js';
import { Biquad, designBiquad } from './biquad.js';

// Algorithmic reverb: a mono input runs through a pre-delay and four
// allpass diffusers into an 8-line feedback delay network mixed by a
// normalised Hadamard matrix. Each line has its own decay gain computed
// from RT60 and a one-pole damping filter, and two lines are slowly
// modulated so long tails don't ring metallically.

const LINES_MS = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.1];
const DIFF_MS = [4.77, 3.59, 12.73, 9.31];

class Line {
  constructor(maxSamples) {
    this.size = pow2Above(maxSamples + 8);
    this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.w = 0;
  }
  read(d) { return hermite(this.buf, this.mask, this.w, d); }
  readInt(d) { return this.buf[(this.w - d) & this.mask]; }
  write(x) { this.w = (this.w + 1) & this.mask; this.buf[this.w] = x; }
  clear() { this.buf.fill(0); }
}

function hadamard8(v) {
  for (let h = 1; h < 8; h <<= 1) {
    for (let i = 0; i < 8; i += h << 1) {
      for (let j = i; j < i + h; j++) { const a = v[j]; const b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
    }
  }
  const s = 1 / Math.sqrt(8);
  for (let i = 0; i < 8; i++) v[i] *= s;
}

export class AlgoReverb {
  constructor(sampleRate) {
    this.sr = sampleRate;
    const ms = sampleRate / 1000;
    this.pre = new Line(Math.ceil(200 * ms));
    this.diff = DIFF_MS.map(d => ({ line: new Line(Math.ceil(d * ms * 1.6)), len: Math.round(d * ms) }));
    this.lines = LINES_MS.map(d => new Line(Math.ceil(d * ms * 2 + 64)));
    this.damp = new Float64Array(8);
    this.v = new Float64Array(8);
    this.lfo = 0;
    this.wetHp = new Biquad();
    this.tmpL = new Float32Array(1); this.tmpR = new Float32Array(1);
    this.mix = new Smoother(0.25, 20, sampleRate);
    this.preDelay = new Smoother(20 * ms, 80, sampleRate);
    this.tail = 6;
    this.glide = 1 - msToCoef(150, sampleRate);
    this.setParams({});
  }
  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    const size = Math.min(1.6, Math.max(0.3, n(p.size, 1)));
    const rt60 = Math.min(12, Math.max(0.2, n(p.decay, 2.2)));
    const dampHz = Math.min(18000, Math.max(800, n(p.damping, 6000)));
    // Line lengths glide toward a new size (a jump would click), decay gains follow the target.
    this.lensTarget = LINES_MS.map(d => d * size * this.sr / 1000);
    if (!this.lens) this.lens = this.lensTarget.slice();
    this.gains = this.lensTarget.map(len => Math.pow(10, (-3 * len) / (rt60 * this.sr)));
    this.dampCoef = Math.exp((-2 * Math.PI * dampHz) / this.sr);
    this.width = Math.min(1, Math.max(0, n(p.width, 100) / 100));
    this.tail = rt60 + 0.3;
    this.modDepth = Math.min(1, Math.max(0, n(p.mod, 30) / 100)) * 0.0012 * this.sr;
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 25) / 100)));
    this.preDelay.set(Math.min(200, Math.max(0, n(p.predelay, 20))) * this.sr / 1000);
    this.wetHp.setCoefs(designBiquad('lowcut', Math.max(20, n(p.lowcut, 120)), 0, 0.71, this.sr));
  }
  reset() { this.pre.clear(); this.diff.forEach(d => d.line.clear()); this.lines.forEach(l => l.clear()); this.damp.fill(0); this.wetHp.reset(); }
  process(L, R, n) {
    const v = this.v; const damp = this.damp; const dc = this.dampCoef;
    const lfoInc = (2 * Math.PI * 0.37) / this.sr;
    for (let i = 0; i < n; i++) {
      const xl = L[i]; const xr = R[i];
      this.pre.write((xl + xr) * 0.5);
      let x = this.pre.read(Math.max(2, this.preDelay.next()));
      for (const d of this.diff) {
        // Schroeder allpass, g = 0.7
        const delayed = d.line.readInt(d.len);
        const u = x + 0.7 * delayed;
        d.line.write(u);
        x = delayed - 0.7 * u;
      }
      this.lfo += lfoInc;
      if (this.lfo > 2 * Math.PI) this.lfo -= 2 * Math.PI;
      const m = this.modDepth * Math.sin(this.lfo);
      for (let k = 0; k < 8; k++) {
        this.lens[k] += (this.lensTarget[k] - this.lens[k]) * this.glide;
        const len = this.lens[k] + (k === 1 ? m : k === 6 ? -m : 0);
        const y = this.lines[k].read(len);
        damp[k] = y * (1 - dc) + damp[k] * dc;
        v[k] = damp[k] * this.gains[k];
      }
      const wl = v[0] - v[2] + v[4] - v[6];
      const wr = v[1] - v[3] + v[5] - v[7];
      hadamard8(v);
      for (let k = 0; k < 8; k++) this.lines[k].write(v[k] + x * 0.35);
      const mid = (wl + wr) * 0.5; const side = (wl - wr) * 0.5 * this.width;
      this.tmpL[0] = (mid + side) * 0.6; this.tmpR[0] = (mid - side) * 0.6;
      this.wetHp.process(this.tmpL, this.tmpR, 0, 1);
      const mix = this.mix.next();
      L[i] = xl * (1 - mix) + this.tmpL[0] * mix;
      R[i] = xr * (1 - mix) + this.tmpR[0] * mix;
    }
  }
}

