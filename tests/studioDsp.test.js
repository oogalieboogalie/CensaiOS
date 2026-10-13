import { Equalizer, eqResponseDb } from '../src/lib/studio/dsp/eq.js';
import { designBiquad, biquadMagnitudeDb } from '../src/lib/studio/dsp/biquad.js';
import { Compressor, Limiter, compressorCurve } from '../src/lib/studio/dsp/dynamics.js';
import { Saturator } from '../src/lib/studio/dsp/saturation.js';
import { Delay } from '../src/lib/studio/dsp/modulation.js';
import { AlgoReverb } from '../src/lib/studio/dsp/reverb.js';
import { ConvReverb } from '../src/lib/studio/dsp/convReverb.js';
import { PartitionedConvolver } from '../src/lib/studio/dsp/convolver.js';
import { Chain } from '../src/lib/studio/chain.js';
import { newEffect } from '../src/lib/studio/effects.js';

// Numerical checks on the Studio's effects: what each one does to a known
// signal is measured, not listened to.

const SR = 48000;
const sine = (freq, sec, amp = 0.5, sr = SR) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / sr));
const db = x => 20 * Math.log10(x);
const peak = (a, from = 0, to = a.length) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i])); return m; };
const rms = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
// Magnitude of one frequency in a signal (Goertzel), normalised so a sine of amplitude A reads A.
function tone(a, freq, from = 0, to = a.length, sr = SR) {
  const k = (2 * Math.PI * freq) / sr; const c = 2 * Math.cos(k);
  let s1 = 0; let s2 = 0;
  for (let i = from; i < to; i++) { const s0 = a[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2)) / (to - from);
}
/** Runs a stereo copy of `input` through `proc` in 128-sample blocks, like the worklet. */
function run(proc, input, right = input) {
  const L = Float32Array.from(input); const R = Float32Array.from(right);
  for (let at = 0; at < L.length; at += 128) {
    const n = Math.min(128, L.length - at);
    proc.process(L.subarray(at, at + n), R.subarray(at, at + n), n);
  }
  return { L, R };
}

describe('EQ', () => {
  test('a +6 dB bell at 1 kHz lifts 1 kHz by 6 dB and leaves 100 Hz and 10 kHz alone', () => {
    const eq = new Equalizer(SR);
    eq.setParams({ bands: [{ on: false }, { gain: 0 }, { type: 'peak', freq: 1000, gain: 6, q: 1, on: true }, { gain: 0 }, { gain: 0 }] });
    for (const [f, want, tol] of [[1000, 6, 0.05], [100, 0, 0.25], [10000, 0, 0.25]]) {
      eq.reset();
      const { L } = run(eq, sine(f, 0.5));
      const measured = db(tone(L, f, SR * 0.25) / 0.5);
      expect(Math.abs(measured - want)).toBeLessThan(tol);
      // The analytic curve the UI draws agrees with what the filter did.
      expect(Math.abs(eqResponseDb(eq.bands.map((b, i) => (i === 2 ? { type: 'peak', freq: 1000, gain: 6, q: 1, on: true } : { on: false, gain: 0 })), f, SR) - measured)).toBeLessThan(tol);
    }
  });

  test('the low cut is 3 dB down at its corner and falls 12 dB per octave below it', () => {
    const c = designBiquad('lowcut', 200, 0, 0.7071, SR);
    expect(biquadMagnitudeDb(c, 200, SR)).toBeCloseTo(-3.01, 1);
    expect(biquadMagnitudeDb(c, 50, SR)).toBeLessThan(-23);
    const eq = new Equalizer(SR);
    eq.setParams({ bands: [{ type: 'lowcut', freq: 200, q: 0.7071, on: true }] });
    const { L } = run(eq, sine(50, 0.5));
    expect(db(tone(L, 50, SR * 0.25) / 0.5)).toBeLessThan(-23);
  });

  test('sweeping a band while audio plays never steps (no clicks)', () => {
    const eq = new Equalizer(SR);
    eq.setParams({ bands: [{ on: false }, { gain: 0 }, { type: 'peak', freq: 300, gain: 0, q: 2, on: true }] });
    const input = sine(200, 0.4, 0.5);
    const L = Float32Array.from(input); const R = Float32Array.from(input);
    let maxJump = 0;
    for (let at = 0; at < L.length; at += 128) {
      if (at === 128 * 40) eq.setParams({ bands: [{ on: false }, { gain: 0 }, { type: 'peak', freq: 300, gain: 18, q: 2, on: true }] });
      eq.process(L.subarray(at, at + 128), R.subarray(at, at + 128), 128);
    }
    for (let i = 1; i < L.length; i++) maxJump = Math.max(maxJump, Math.abs(L[i] - L[i - 1]));
    // A 200 Hz sine at its loudest moves at most 2*pi*200/48000*A per sample; a click would be far bigger.
    expect(maxJump).toBeLessThan(((2 * Math.PI * 200) / SR) * 0.5 * 8 * 1.2);
  });
});

describe('Compressor', () => {
  test('static curve: 4:1 above -20 dB, unity below, soft through the knee', () => {
    expect(compressorCurve(-30, -20, 4, 0)).toBeCloseTo(-30, 6);
    expect(compressorCurve(-8, -20, 4, 0)).toBeCloseTo(-17, 6);
    expect(compressorCurve(-20, -20, 4, 6)).toBeLessThan(-20);
    expect(compressorCurve(-20, -20, 4, 6)).toBeGreaterThan(-21);
  });

  test('a -6 dBFS sine settles 10.5 dB down at 4:1 from -20 dB, plus makeup', () => {
    const comp = new Compressor(SR);
    comp.setParams({ threshold: -20, ratio: 4, knee: 0, attack: 5, release: 200, makeup: 3 });
    const { L } = run(comp, sine(220, 1.5, 0.5));
    const outPeak = db(peak(L, SR, SR * 1.5));
    expect(outPeak).toBeGreaterThan(-16.5 + 3 - 0.6);
    expect(outPeak).toBeLessThan(-16.5 + 3 + 0.6);
    expect(comp.meter()).toBeGreaterThan(9.5);
  });

  test('a signal under the threshold passes untouched', () => {
    const comp = new Compressor(SR);
    comp.setParams({ threshold: -10, ratio: 8, knee: 0 });
    const input = sine(440, 0.3, 0.2);
    const { L } = run(comp, input);
    let err = 0;
    for (let i = 0; i < L.length; i++) err = Math.max(err, Math.abs(L[i] - input[i]));
    expect(err).toBeLessThan(1e-6);
  });
});

describe('Limiter', () => {
  test('holds sample peaks at the ceiling on a +12 dB burst without clipping the waveform flat', () => {
    const lim = new Limiter(SR);
    lim.setParams({ ceiling: -1, release: 60 });
    const input = sine(100, 0.5, 4);
    const { L, R } = run(lim, input);
    expect(peak(L)).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
    expect(peak(R)).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
    // Gain-reduced, not chopped: the 3rd harmonic stays far under the fundamental.
    expect(tone(L, 300, SR * 0.2) / tone(L, 100, SR * 0.2)).toBeLessThan(0.05);
  });
});

describe('Saturation', () => {
  test('4x oversampling pushes the alias of a driven 15 kHz tone 50 dB down, 30 dB better than none', () => {
    const sat = new Saturator(SR);
    sat.setParams({ mode: 'tape', drive: 12, tone: 20000, output: 0, mix: 100 });
    const input = sine(15000, 0.5, 0.8);
    const { L } = run(sat, input);
    // The 3rd harmonic (45 kHz) folds back to 3 kHz when the curve runs at the base rate.
    const oversampled = db(tone(L, 3000, SR * 0.1) / tone(L, 15000, SR * 0.1));
    const naive = input.map(x => Math.tanh(x * 4));
    const plain = db(tone(naive, 3000, SR * 0.1) / tone(naive, 15000, SR * 0.1));
    expect(oversampled).toBeLessThan(-50);
    expect(plain - oversampled).toBeGreaterThan(30);
  });

  test('drive adds harmonics: the 3rd harmonic of a 200 Hz tone rises well above the floor', () => {
    const sat = new Saturator(SR);
    sat.setParams({ mode: 'tape', drive: 24, tone: 20000, mix: 100 });
    const { L } = run(sat, sine(200, 0.5, 0.8));
    expect(db(tone(L, 600, SR * 0.1) / tone(L, 200, SR * 0.1))).toBeGreaterThan(-25);
  });
});

describe('Delay, reverbs and convolution', () => {
  test('a synced 1/4 delay at 120 BPM repeats an impulse 0.5 s later, quieter by the feedback', () => {
    const d = new Delay(SR);
    d.setParams({ sync: true, division: '1/4', feedback: 50, mix: 100, lowcut: 20, highcut: 20000 }, { bpm: 120 });
    d.time.snap();
    const input = new Float32Array(SR * 1.2); input[100] = 1;
    const { L } = run(d, input);
    // Echo strength as energy: the repeat filters spread the click over a few samples.
    const first = rms(L, 100 + SR * 0.5 - 50, 100 + SR * 0.5 + 50) * 10;
    const second = rms(L, 100 + SR - 50, 100 + SR + 50) * 10;
    expect(first).toBeGreaterThan(0.85);
    expect(second / first).toBeGreaterThan(0.4);
    expect(second / first).toBeLessThan(0.6);
    expect(peak(L, 200, 100 + SR * 0.5 - 50)).toBeLessThan(0.01);
  });

  test('partitioned convolution matches direct convolution', () => {
    const B = 64;
    const conv = new PartitionedConvolver(B);
    const irL = Float32Array.from({ length: 300 }, (_, i) => Math.exp(-i / 60) * Math.sin(i * 0.3));
    const irR = Float32Array.from({ length: 300 }, (_, i) => Math.exp(-i / 40) * Math.cos(i * 0.2));
    const parts = [];
    for (let at = 0; at < 300; at += B) {
      const l = new Float32Array(B); const r = new Float32Array(B);
      l.set(irL.subarray(at, at + B)); r.set(irR.subarray(at, at + B));
      parts.push(conv.partition(l, r));
    }
    conv.setPartitions(parts);
    const x = Float64Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.05) + (i % 97 === 0 ? 1 : 0));
    const wl = new Float64Array(1000); const wr = new Float64Array(1000);
    for (let at = 0; at < 1000; at += 37) { const n = Math.min(37, 1000 - at); conv.process(x.subarray(at, at + n), wl.subarray(at, at + n), wr.subarray(at, at + n), n); }
    let err = 0;
    for (let i = B; i < 1000; i++) {
      let yl = 0; let yr = 0;
      for (let k = 0; k < 300 && k <= i - B; k++) { yl += irL[k] * x[i - B - k]; yr += irR[k] * x[i - B - k]; }
      err = Math.max(err, Math.abs(yl - wl[i]), Math.abs(yr - wr[i]));
    }
    expect(err).toBeLessThan(1e-9);
  });

  test('both reverbs decay: the tail is 40+ dB down a decay time after the hit', () => {
    for (const [proc, params, rt] of [[new AlgoReverb(SR), { decay: 1, mix: 100, predelay: 0 }, 1], [new ConvReverb(SR), { space: 'room', decay: 1, mix: 100, predelay: 0 }, 0.8]]) {
      proc.setParams(params);
      proc.flush?.();
      const input = new Float32Array(Math.round(SR * (rt + 0.6))); input[0] = 1;
      const { L } = run(proc, input);
      const early = rms(L, Math.round(SR * 0.03), Math.round(SR * 0.08));
      const late = rms(L, Math.round(SR * rt), Math.round(SR * (rt + 0.05)));
      expect(early).toBeGreaterThan(0);
      expect(db(late / early)).toBeLessThan(-40);
    }
  });
});

describe('Effect chain', () => {
  test('toggling an effect crossfades instead of jumping', () => {
    const chain = new Chain(SR);
    const sat = { ...newEffect('saturation'), id: 'a', params: { ...newEffect('saturation').params, drive: 30, output: -12 } };
    chain.set([sat]);
    const input = sine(80, 0.4, 0.5);
    const L = Float32Array.from(input); const R = Float32Array.from(input);
    let jump = 0;
    for (let at = 0; at < L.length; at += 128) {
      if (at === 128 * 60) chain.set([{ ...sat, on: false }]);
      chain.process(L.subarray(at, at + 128), R.subarray(at, at + 128), 128);
    }
    for (let i = SR * 0.05; i < L.length; i++) jump = Math.max(jump, Math.abs(L[i] - L[i - 1]));
    expect(jump).toBeLessThan(0.05);
  });

  test('effects run in order: limiter after a +20 dB gain stage caps the peak, before it does not', () => {
    const boost = { id: 'eq', type: 'eq', on: true, params: { out: 20 } };
    const lim = { id: 'lim', type: 'limiter', on: true, params: { ceiling: -3 } };
    const after = new Chain(SR); after.set([boost, lim]);
    const before = new Chain(SR); before.set([lim, boost]);
    const outA = run(after, sine(300, 0.3, 0.3)); const outB = run(before, sine(300, 0.3, 0.3));
    expect(peak(outA.L, SR * 0.1)).toBeLessThanOrEqual(Math.pow(10, -3 / 20) + 1e-6);
    expect(peak(outB.L, SR * 0.1)).toBeGreaterThan(2);
  });
});
