import { clamp, rng } from './util.js';

// A synthesized drum kit for piano-roll tracks whose preset is "drums".
// Each note number is one drum (General MIDI numbers, so a MIDI file from
// anywhere lands on the right sound): 36 kick, 38 snare, 39 clap, 42 closed
// hat, 46 open hat, 45/48 toms. Hits are one-shots, so note-off does
// nothing except a closed hat cutting an open one, like a real hi-hat.

export const DRUM_NOTES = Object.freeze({ kick: 36, snare: 38, clap: 39, hat: 42, tomLow: 45, openHat: 46, tomHigh: 48 });
const HITS = 10;

const kindOf = (note) => {
  if (note <= 36) return 'kick';
  if (note === 38 || note === 40) return 'snare';
  if (note === 39) return 'clap';
  if (note === 42 || note === 44) return 'hat';
  if (note === 46) return 'openHat';
  if (note < 50) return 'tom';
  return 'hat';
};

export class DrumKit {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.level = Math.pow(10, -6 / 20);
    this.hits = [];
    this.rand = rng(11);
  }
  setParams(p) { this.level = Math.pow(10, clamp(Number.isFinite(+p?.level) ? +p.level : -6, -36, 0) / 20); }
  noteOn(note, vel) {
    const kind = kindOf(note);
    if (kind === 'hat') this.hits = this.hits.filter(h => h.kind !== 'openHat');
    if (this.hits.length >= HITS) this.hits.shift();
    this.hits.push({ kind, note, vel: clamp(vel, 0, 1), t: 0, ph: 0, hp: 0, last: 0, bp1: 0, bp2: 0 });
  }
  noteOff() {}
  allOff() { this.hits = []; }
  get active() { return this.hits.length > 0; }

  /** Adds every ringing hit into L/R from `from` to `to`. */
  render(L, R, from, to) {
    const sr = this.sr; const level = this.level;
    for (const h of this.hits) {
      const g = level * (0.35 + 0.65 * h.vel);
      const end = Math.min(to, from + Math.max(0, Math.ceil(LENGTH[h.kind] * sr) - h.t));
      for (let i = from; i < end; i++) {
        const s = h.t / sr;
        const y = this.sample(h, s) * g;
        h.t++;
        L[i] += y; R[i] += y;
      }
    }
    this.hits = this.hits.filter(h => h.t < LENGTH[h.kind] * sr);
  }

  sample(h, s) {
    const sr = this.sr;
    const noise = () => this.rand() * 2 - 1;
    switch (h.kind) {
      case 'kick': {
        // A sine falling from 150 Hz to 48 Hz, with a short click on top.
        const f = 48 + 102 * Math.exp(-s * 28);
        h.ph += f / sr;
        return Math.sin(2 * Math.PI * h.ph) * Math.exp(-s * 7.5) * 1.1 + (s < 0.004 ? noise() * 0.25 : 0);
      }
      case 'tom': {
        const base = h.note < 47 ? 95 : 140;
        h.ph += (base + base * 0.6 * Math.exp(-s * 20)) / sr;
        return Math.sin(2 * Math.PI * h.ph) * Math.exp(-s * 9) * 0.8;
      }
      case 'snare': {
        h.ph += 185 / sr;
        const tone = Math.sin(2 * Math.PI * h.ph) * Math.exp(-s * 30) * 0.5;
        return tone + this.highpass(h, noise()) * Math.exp(-s * 18) * 0.7;
      }
      case 'clap': {
        // Three quick bursts, then a short tail, the way hands smear together.
        const burst = s < 0.03 ? Math.exp(-((s * 1000) % 10) * 0.35) : Math.exp(-(s - 0.03) * 22);
        return this.bandpass(h, noise()) * burst * 0.9;
      }
      case 'openHat': return this.highpass(h, noise()) * Math.exp(-s * 7) * 0.32;
      default: return this.highpass(h, noise()) * Math.exp(-s * 45) * 0.38;
    }
  }

  /** One-zero, one-pole high-pass: keeps the sizzle, drops the thump. */
  highpass(h, x) { const y = 0.92 * (h.hp + x - h.last); h.hp = y; h.last = x; return y; }
  /** Two-pole resonator around 1.2 kHz for the clap. */
  bandpass(h, x) {
    const w = (2 * Math.PI * 1200) / this.sr; const r = 0.94;
    const y = x * (1 - r) + 2 * r * Math.cos(w) * h.bp1 - r * r * h.bp2;
    h.bp2 = h.bp1; h.bp1 = y;
    return y * 3;
  }
}

// Seconds each drum rings before it is dropped.
const LENGTH = { kick: 0.7, tom: 0.6, snare: 0.35, clap: 0.35, hat: 0.12, openHat: 0.7 };
