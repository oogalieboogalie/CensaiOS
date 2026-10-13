import { clamp, rng } from './util.js';

// Polyphonic subtractive synth for piano-roll tracks: two band-limited
// oscillators (polyBLEP saw and square, triangle, sine), a TPT state
// variable low-pass with its own envelope, an amp ADSR and per-voice pan
// spread. 12 voices; the quietest releasing voice is stolen first.

export const SYNTH_PRESETS = Object.freeze({
  keys: { label: 'Keys', osc1: 'tri', osc2: 'saw', mix: 0.25, detune: 4, oct2: 0, cutoff: 3200, res: 0.15, envAmt: 2400, a: 0.004, d: 0.5, s: 0.45, r: 0.35, fa: 0.002, fd: 0.35, fs: 0.2, fr: 0.3, level: -12 },
  pad: { label: 'Pad', osc1: 'saw', osc2: 'saw', mix: 0.5, detune: 11, oct2: 0, cutoff: 1400, res: 0.2, envAmt: 1800, a: 0.6, d: 1.2, s: 0.8, r: 1.4, fa: 0.9, fd: 1.5, fs: 0.5, fr: 1.2, level: -16 },
  bass: { label: 'Bass', osc1: 'saw', osc2: 'square', mix: 0.45, detune: 2, oct2: -1, cutoff: 380, res: 0.35, envAmt: 1600, a: 0.002, d: 0.25, s: 0.6, r: 0.12, fa: 0.001, fd: 0.18, fs: 0.1, fr: 0.12, level: -10 },
  pluck: { label: 'Pluck', osc1: 'square', osc2: 'saw', mix: 0.35, detune: 6, oct2: 1, cutoff: 900, res: 0.3, envAmt: 5200, a: 0.001, d: 0.28, s: 0, r: 0.25, fa: 0.001, fd: 0.16, fs: 0, fr: 0.2, level: -13 },
  lead: { label: 'Lead', osc1: 'saw', osc2: 'square', mix: 0.4, detune: 7, oct2: 0, cutoff: 2600, res: 0.4, envAmt: 2000, a: 0.01, d: 0.3, s: 0.7, r: 0.2, fa: 0.01, fd: 0.4, fs: 0.4, fr: 0.25, level: -14 },
});

const VOICES = 12;
const WAVES = ['saw', 'square', 'tri', 'sine'];

function blep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

function osc(wave, phase, dt) {
  switch (wave) {
    case 'sine': return Math.sin(2 * Math.PI * phase);
    case 'tri': return 1 - 4 * Math.abs(phase - 0.5);
    case 'square': {
      let v = phase < 0.5 ? 1 : -1;
      v += blep(phase, dt);
      v -= blep((phase + 0.5) % 1, dt);
      return v;
    }
    default: return 2 * phase - 1 - blep(phase, dt);
  }
}

/** Per-block envelope rates: linear attack step, exponential decay and release. */
function rates(a, d, r, sr) {
  return { up: 1 / Math.max(1, a * sr), dc: Math.exp(-1 / Math.max(1, d * sr * 0.3)), rc: Math.exp(-1 / Math.max(1, r * sr * 0.2)) };
}

/** ADSR stage advance: returns the new level. Stage 3 is idle. */
function env(e, k, s) {
  if (e.stage === 0) { e.v += k.up; if (e.v >= 1) { e.v = 1; e.stage = 1; } } else if (e.stage === 1) {
    e.v = s + (e.v - s) * k.dc;
  } else if (e.stage === 2) {
    e.v *= k.rc;
  }
  return e.v;
}

export function normalizeSynth(p) {
  const base = SYNTH_PRESETS[p?.preset] || SYNTH_PRESETS.keys;
  const out = { preset: SYNTH_PRESETS[p?.preset] ? p.preset : 'keys' };
  for (const [k, v] of Object.entries(base)) {
    if (k === 'label') continue;
    const given = p?.[k];
    if (typeof v === 'string') out[k] = WAVES.includes(given) ? given : v;
    else out[k] = Number.isFinite(+given) ? +given : v;
  }
  return out;
}

export class Synth {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.p = normalizeSynth({});
    this.voices = Array.from({ length: VOICES }, (_, i) => ({ on: false, note: -1, ph1: 0, ph2: 0, ic1: 0, ic2: 0, amp: { stage: 3, v: 0 }, flt: { stage: 3, v: 0 }, vel: 0, pan: ((i % 5) - 2) * 0.12, g: 0, k: 0, age: 0 }));
    this.counter = 0;
    this.rand = rng(7);
  }
  setParams(p) { this.p = normalizeSynth(p); }
  noteOn(note, vel) {
    let v = this.voices.find(x => x.amp.stage === 3);
    if (!v) {
      const releasing = this.voices.filter(x => x.amp.stage === 2).sort((a, b) => a.amp.v - b.amp.v)[0];
      v = releasing || this.voices.reduce((o, x) => (x.age < o.age ? x : o));
    }
    Object.assign(v, { on: true, note, vel: clamp(vel, 0, 1), age: ++this.counter, ph1: this.rand(), ph2: this.rand() });
    v.amp.stage = 0; v.flt.stage = 0; v.flt.v = 0;
  }
  noteOff(note) { this.voices.forEach(v => { if (v.on && v.note === note) { v.on = false; v.amp.stage = 2; v.flt.stage = 2; } }); }
  allOff() { this.voices.forEach(v => { if (v.amp.stage !== 3) { v.on = false; v.amp.stage = 2; v.flt.stage = 2; } }); }
  get active() { return this.voices.some(v => v.amp.stage !== 3); }

  /** Adds voices into L/R from `from` to `to`. */
  render(L, R, from, to) {
    const p = this.p; const sr = this.sr;
    const level = Math.pow(10, p.level / 20);
    const detune = Math.pow(2, p.detune / 1200) * Math.pow(2, p.oct2);
    const k = 2 - 2 * clamp(p.res, 0, 0.98);
    const ampK = rates(p.a, p.d, p.r, sr); const fltK = rates(p.fa, p.fd, p.fr, sr);
    for (const v of this.voices) {
      if (v.amp.stage === 3) continue;
      const f = 440 * Math.pow(2, (v.note - 69) / 12);
      const dt1 = f / sr; const dt2 = (f * detune) / sr;
      const gl = Math.cos((v.pan + 1) * Math.PI / 4) * Math.SQRT2; const gr = Math.sin((v.pan + 1) * Math.PI / 4) * Math.SQRT2;
      let g = v.g; let z1 = v.ic1; let z2 = v.ic2;
      for (let i = from; i < to; i++) {
        const a = env(v.amp, ampK, p.s);
        const fe = env(v.flt, fltK, p.fs);
        if ((i - from) % 16 === 0) {
          const fc = clamp(p.cutoff + p.envAmt * fe * (0.4 + 0.6 * v.vel), 30, sr * 0.45);
          g = Math.tan((Math.PI * fc) / sr);
        }
        const x = osc(p.osc1, v.ph1, dt1) * (1 - p.mix) + osc(p.osc2, v.ph2, dt2) * p.mix;
        v.ph1 += dt1; if (v.ph1 >= 1) v.ph1 -= 1;
        v.ph2 += dt2; if (v.ph2 >= 1) v.ph2 -= 1;
        // Zavalishin TPT state variable filter, low-pass output.
        const hp = (x - (k + g) * z1 - z2) / (1 + k * g + g * g);
        const bp = g * hp + z1; z1 = g * hp + bp;
        const lp = g * bp + z2; z2 = g * bp + lp;
        const y = lp * a * level * (0.3 + 0.7 * v.vel);
        L[i] += y * gl; R[i] += y * gr;
      }
      v.g = g; v.ic1 = z1; v.ic2 = z2;
      if (v.amp.stage === 2 && v.amp.v < 1e-4) { v.amp.stage = 3; v.amp.v = 0; v.ic1 = 0; v.ic2 = 0; }
    }
  }
}
