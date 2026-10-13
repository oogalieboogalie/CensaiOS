import { Biquad, designBiquad, biquadMagnitudeDb, FILTER_TYPES } from './biquad.js';
import { Smoother, dbToGain } from './util.js';

// Five-band parametric EQ. Each band's frequency, gain and Q glide through
// smoothers (frequency in log space) and coefficients are redesigned every
// 16 samples while anything moves, so sweeping a band is click-free.

const CONTROL = 16;

export const EQ_DEFAULT_BANDS = Object.freeze([
  { type: 'lowcut', freq: 40, gain: 0, q: 0.71, on: false },
  { type: 'lowshelf', freq: 120, gain: 0, q: 0.71, on: true },
  { type: 'peak', freq: 450, gain: 0, q: 1, on: true },
  { type: 'peak', freq: 2500, gain: 0, q: 1, on: true },
  { type: 'highshelf', freq: 9000, gain: 0, q: 0.71, on: true },
]);

export function normalizeBand(b, i) {
  const d = EQ_DEFAULT_BANDS[i] || EQ_DEFAULT_BANDS[2];
  const num = (v, lo, hi, fb) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fb);
  return {
    type: FILTER_TYPES.includes(b?.type) ? b.type : d.type,
    freq: num(b?.freq, 20, 20000, d.freq),
    gain: num(b?.gain, -24, 24, d.gain),
    q: num(b?.q, 0.1, 18, d.q),
    on: b?.on === undefined ? d.on : Boolean(b.on),
  };
}

/** Whole-EQ response in dB at `freq` for the given bands (drives the EQ curve). */
export function eqResponseDb(bands, freq, sampleRate, outDb = 0) {
  let db = outDb;
  bands.forEach((raw, i) => {
    const b = normalizeBand(raw, i);
    if (b.on) db += biquadMagnitudeDb(designBiquad(b.type, b.freq, b.gain, b.q, sampleRate), freq, sampleRate);
  });
  return db;
}

export class Equalizer {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.bands = EQ_DEFAULT_BANDS.map(() => ({
      f: new Biquad(),
      logF: new Smoother(Math.log(1000), 30, sampleRate / CONTROL),
      gain: new Smoother(0, 30, sampleRate / CONTROL),
      q: new Smoother(1, 30, sampleRate / CONTROL),
      type: 'peak',
      on: false,
      fresh: true,
    }));
    this.out = new Smoother(1, 20, sampleRate);
    this.tail = 0.05;
  }

  setParams(p = {}) {
    const list = Array.isArray(p.bands) ? p.bands : EQ_DEFAULT_BANDS;
    this.bands.forEach((band, i) => {
      const b = normalizeBand(list[i], i);
      if (band.type !== b.type) { band.type = b.type; band.fresh = true; }
      band.on = b.on;
      band.logF.set(Math.log(b.freq));
      // A bell or shelf that is switched off glides to 0 dB instead of popping out.
      band.gain.set(b.on ? b.gain : 0);
      band.q.set(b.q);
      if (band.fresh) {
        band.logF.snap(); band.gain.snap(); band.q.snap();
        band.f.setCoefs(designBiquad(band.type, Math.exp(band.logF.value), band.gain.value, band.q.value, this.sr));
        band.fresh = false;
      }
    });
    this.out.set(dbToGain(Number.isFinite(+p.out) ? +p.out : 0));
  }

  reset() { this.bands.forEach(b => b.f.reset()); }

  process(L, R, n) {
    for (let start = 0; start < n; start += CONTROL) {
      const end = Math.min(n, start + CONTROL);
      for (const band of this.bands) {
        const cut = band.type === 'lowcut' || band.type === 'highcut';
        // Cut filters cannot glide to neutral, so they switch on/off whole.
        if (cut ? !band.on : (!band.on && band.gain.settled)) continue;
        if (!(band.logF.settled && band.gain.settled && band.q.settled)) {
          band.logF.next(); band.gain.next(); band.q.next();
          band.f.setCoefs(designBiquad(band.type, Math.exp(band.logF.value), band.gain.value, band.q.value, this.sr));
        }
        band.f.process(L, R, start, end);
      }
    }
    if (this.out.settled && this.out.value === 1) return;
    for (let i = 0; i < n; i++) { const g = this.out.next(); L[i] *= g; R[i] *= g; }
  }
}
