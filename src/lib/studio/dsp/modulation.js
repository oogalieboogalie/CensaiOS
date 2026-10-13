import { Smoother, hermite, DIVISIONS } from './util.js';
import { Biquad, designBiquad } from './biquad.js';

// Chorus and tempo-synced delay. Both read their delay lines with 4-point
// Hermite interpolation, so modulated or gliding delay times stay smooth.

export class Chorus {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.size = 4096; // ~85 ms at 48 kHz
    this.mask = this.size - 1;
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.phase = 0;
    this.rate = new Smoother(0.8, 50, sampleRate);
    this.depth = new Smoother(3, 50, sampleRate);
    this.base = new Smoother(12, 50, sampleRate);
    this.mix = new Smoother(0.5, 20, sampleRate);
    this.fb = new Smoother(0, 20, sampleRate);
    this.last = [0, 0];
    this.tail = 0.1;
    this.setParams({});
  }
  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    this.rate.set(Math.min(8, Math.max(0.05, n(p.rate, 0.8))));
    this.depth.set(Math.min(8, Math.max(0, n(p.depth, 3))));
    this.base.set(Math.min(30, Math.max(3, n(p.delay, 12))));
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 50) / 100)));
    this.fb.set(Math.min(0.7, Math.max(0, n(p.feedback, 0) / 100)));
  }
  reset() { this.buf.forEach(b => b.fill(0)); this.last = [0, 0]; }
  process(L, R, n) {
    const msToS = this.sr * 0.001;
    const { mask } = this;
    for (let i = 0; i < n; i++) {
      const rate = this.rate.next(); const depth = this.depth.next() * msToS;
      const base = this.base.next() * msToS; const mix = this.mix.next(); const fb = this.fb.next();
      this.phase += rate / this.sr;
      if (this.phase >= 1) this.phase -= 1;
      const w = this.w;
      for (let c = 0; c < 2; c++) {
        const buf = c === 0 ? L : R;
        const x = buf[i];
        const line = this.buf[c];
        line[w] = x + this.last[c] * fb;
        // Two voices per side, a quarter cycle apart between left and right.
        const p0 = this.phase + c * 0.25;
        const d1 = base + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * p0));
        const d2 = base + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p0 + 0.5)));
        const wet = 0.5 * (hermite(line, mask, w, d1) + hermite(line, mask, w, d2));
        this.last[c] = wet;
        buf[i] = x * (1 - mix * 0.5) + wet * mix;
      }
      this.w = (w + 1) & mask;
    }
  }
}

export class Delay {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.size = 1 << Math.ceil(Math.log2(sampleRate * 4.2));
    this.mask = this.size - 1;
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    // Delay time glides like tape when it changes, instead of jumping.
    this.time = new Smoother(sampleRate * 0.375, 120, sampleRate);
    this.fb = new Smoother(0.35, 20, sampleRate);
    this.mix = new Smoother(0.3, 20, sampleRate);
    this.hp = new Biquad(); this.lp = new Biquad();
    this.fbL = new Float32Array(1); this.fbR = new Float32Array(1);
    this.tail = 4;
    this.bpm = 120;
    this.setParams({});
  }
  setParams(p = {}, ctx = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    if (Number.isFinite(ctx.bpm) && ctx.bpm > 0) this.bpm = ctx.bpm;
    const sync = p.sync !== false;
    const beats = DIVISIONS[p.division] ?? DIVISIONS['1/8d'];
    const sec = sync ? (beats * 60) / this.bpm : Math.min(4000, Math.max(1, n(p.ms, 375))) / 1000;
    this.time.set(Math.min(4, Math.max(0.001, sec)) * this.sr);
    this.fb.set(Math.min(0.95, Math.max(0, n(p.feedback, 35) / 100)));
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 30) / 100)));
    this.pingPong = Boolean(p.pingpong);
    this.hp.setCoefs(designBiquad('lowcut', Math.max(20, n(p.lowcut, 150)), 0, 0.71, this.sr));
    this.lp.setCoefs(designBiquad('highcut', Math.min(20000, n(p.highcut, 6000)), 0, 0.71, this.sr));
  }
  reset() { this.buf.forEach(b => b.fill(0)); this.hp.reset(); this.lp.reset(); }
  process(L, R, n) {
    const { mask } = this; const [bl, br] = this.buf;
    const fl = this.fbL; const fr = this.fbR;
    for (let i = 0; i < n; i++) {
      const d = Math.max(3, this.time.next()); const fb = this.fb.next(); const mix = this.mix.next();
      const w = this.w;
      let yl = hermite(bl, mask, w, d); let yr = hermite(br, mask, w, d);
      // Filter the feedback path so repeats darken and thin out like a real echo.
      fl[0] = yl; fr[0] = yr;
      this.hp.process(fl, fr, 0, 1); this.lp.process(fl, fr, 0, 1);
      yl = fl[0]; yr = fr[0];
      const xl = L[i]; const xr = R[i];
      if (this.pingPong) {
        bl[w] = (xl + xr) * 0.5 + yr * fb;
        br[w] = yl * fb;
      } else {
        bl[w] = xl + yl * fb;
        br[w] = xr + yr * fb;
      }
      L[i] = xl + yl * mix;
      R[i] = xr + yr * mix;
      this.w = (w + 1) & mask;
    }
  }
}
