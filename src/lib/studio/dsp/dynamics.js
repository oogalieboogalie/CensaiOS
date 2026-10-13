import { Smoother, dbToGain, msToCoef } from './util.js';

// Compressor and limiter.
//
// The compressor is a stereo-linked feed-forward design with a soft knee and
// a smooth log-domain level detector (Giannoulis, Massberg and Reiss 2012):
// gain reduction is computed per sample in dB and smoothed with separate
// attack and release, so it never steps and pumps only as much as asked.

/** Static curve: output level in dB for an input level in dB. */
export function compressorCurve(xDb, threshold, ratio, knee) {
  const over = xDb - threshold;
  if (knee > 0 && Math.abs(over) <= knee / 2) {
    const k = over + knee / 2;
    return xDb + ((1 / ratio - 1) * k * k) / (2 * knee);
  }
  return over > 0 ? threshold + over / ratio : xDb;
}

export class Compressor {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.y = 0; // smoothed gain reduction in dB (>= 0)
    this.makeup = new Smoother(1, 20, sampleRate);
    this.mix = new Smoother(1, 20, sampleRate);
    this.reduction = 0; // peak reduction since last meter read
    this.tail = 0.3;
    this.setParams({});
  }
  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    this.threshold = n(p.threshold, -18);
    this.ratio = Math.max(1, n(p.ratio, 4));
    this.knee = Math.max(0, n(p.knee, 6));
    this.att = msToCoef(Math.max(0.05, n(p.attack, 10)), this.sr);
    this.rel = msToCoef(Math.max(5, n(p.release, 120)), this.sr);
    this.makeup.set(dbToGain(n(p.makeup, 0)));
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 100) / 100)));
  }
  reset() { this.y = 0; }
  meter() { const r = this.reduction; this.reduction = 0; return r; }
  process(L, R, n) {
    const { threshold, ratio, knee, att, rel } = this;
    let y = this.y;
    let peak = this.reduction;
    for (let i = 0; i < n; i++) {
      const l = L[i]; const r = R[i];
      const a = Math.max(Math.abs(l), Math.abs(r));
      const xDb = a > 1e-6 ? 20 * Math.log10(a) : -120;
      const want = xDb - compressorCurve(xDb, threshold, ratio, knee);
      y = want > y ? att * y + (1 - att) * want : rel * y + (1 - rel) * want;
      if (y > peak) peak = y;
      const g = Math.pow(10, -y / 20) * this.makeup.next();
      const m = this.mix.next();
      const wet = g * m + (1 - m);
      L[i] = l * wet; R[i] = r * wet;
    }
    this.y = y < 1e-9 ? 0 : y;
    this.reduction = peak;
  }
}

/**
 * Lookahead brickwall limiter. Required gain is min-held over the lookahead
 * window, released exponentially and then box-averaged over the same window,
 * and the signal is delayed to match. Each averaged value is a mean of
 * minima that all cover the delayed sample, so it can never exceed the gain
 * that sample needs: sample peaks stay at or under the ceiling, without the
 * clicks a hard clip makes.
 */
export class Limiter {
  constructor(sampleRate, lookaheadMs = 1.5) {
    this.sr = sampleRate;
    this.len = Math.max(2, Math.round(lookaheadMs * 0.001 * sampleRate));
    this.dl = new Float32Array(this.len); this.dr = new Float32Array(this.len);
    this.need = new Float64Array(this.len);
    this.box = new Float64Array(this.len);
    this.boxSum = this.len;
    this.box.fill(1); this.need.fill(1);
    this.pos = 0; this.held = 1; this.heldAge = 0; this.rel = 1;
    this.gainOut = 1; this.reduction = 0; this.tail = 0.01;
    this.input = new Smoother(1, 20, sampleRate);
    this.setParams({});
  }
  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    this.ceiling = dbToGain(Math.min(0, n(p.ceiling, -1)));
    this.release = msToCoef(Math.max(1, n(p.release, 80)), this.sr);
    this.input.set(dbToGain(n(p.gain, 0)));
  }
  reset() { this.dl.fill(0); this.dr.fill(0); this.need.fill(1); this.box.fill(1); this.boxSum = this.len; this.rel = 1; }
  meter() { const r = this.reduction; this.reduction = 0; return r; }
  process(L, R, n) {
    const { len, dl, dr, need, box, ceiling, release } = this;
    let pos = this.pos; let sum = this.boxSum; let rel = this.rel; let peakRed = this.reduction;
    for (let i = 0; i < n; i++) {
      const g0 = this.input.next();
      const l = L[i] * g0; const r = R[i] * g0;
      const a = Math.max(Math.abs(l), Math.abs(r));
      need[pos] = a > ceiling ? ceiling / a : 1;
      // Min over the lookahead window (len is small, a scan is cheaper than a deque).
      let m = 1;
      for (let k = 0; k < len; k++) if (need[k] < m) m = need[k];
      rel = m < rel ? m : m + (rel - m) * release;
      sum += rel - box[pos];
      box[pos] = rel;
      const g = Math.min(1, sum / len);
      const red = -20 * Math.log10(g);
      if (red > peakRed) peakRed = red;
      dl[pos] = l; dr[pos] = r;
      pos = pos + 1 === len ? 0 : pos + 1;
      // The oldest sample in the window (delay len - 1) is the one every box term covers.
      L[i] = dl[pos] * g; R[i] = dr[pos] * g;
    }
    this.pos = pos; this.boxSum = sum; this.rel = rel; this.reduction = peakRed;
  }
}
