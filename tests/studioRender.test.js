import { normalizeProject, starterProject, snapBeats } from '../src/lib/studio/project.js';
import { renderProject } from '../src/lib/studio/render.js';
import { encodeWav, decodeWav } from '../src/lib/studio/wav.js';
import { Engine } from '../src/lib/studio/engine.js';
import { newEffect } from '../src/lib/studio/effects.js';

// Offline render of whole projects through the engine that also plays live.
// Every check is numeric: what reaches the mix bus is measured.

const SR = 48000;
const db = x => 20 * Math.log10(x);
const peak = (a, from = 0, to = a.length) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i])); return m; };
const sine = (freq, sec, amp) => Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));
function tone(a, freq, from, to) {
  const k = (2 * Math.PI * freq) / SR; const c = 2 * Math.cos(k);
  let s1 = 0; let s2 = 0;
  for (let i = from; i < to; i++) { const s0 = a[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2)) / (to - from);
}

const audioProject = (fx, extra = {}) => normalizeProject({
  bpm: 120,
  tracks: [{ id: 't1', kind: 'audio', fx, clips: [{ id: 'c1', asset: 'a1', start: 0, offset: 0, dur: 2 }], ...extra }],
  master: { limiter: { on: false } },
});

describe('offline render', () => {
  test('a -6 dBFS 1 kHz tone through EQ (+6 dB at 1 kHz) then a 4:1 compressor lands where the maths says', () => {
    const eq = { id: 'eq', type: 'eq', on: true, params: { bands: [{ on: false }, { gain: 0 }, { type: 'peak', freq: 1000, gain: 6, q: 1, on: true }, { gain: 0 }, { gain: 0 }] } };
    const comp = { id: 'comp', type: 'compressor', on: true, params: { threshold: -12, ratio: 4, knee: 0, attack: 5, release: 200, makeup: 0 } };
    const { left, right } = renderProject(audioProject([eq, comp]), { a1: [sine(1000, 2, 0.5)] }, { sampleRate: SR });
    // -6 dBFS + 6 dB = 0 dBFS into the compressor; 12 dB over at 4:1 leaves 3 dB over: -9 dBFS.
    const level = db(peak(left, SR, SR * 1.8));
    expect(level).toBeGreaterThan(-9 - 0.6);
    expect(level).toBeLessThan(-9 + 0.6);
    expect(peak(right, SR, SR * 1.8)).toBeCloseTo(peak(left, SR, SR * 1.8), 6);
    // It's still a clean 1 kHz tone: nothing else got in.
    expect(db(tone(left, 1000, SR, SR * 1.8) / peak(left, SR, SR * 1.8))).toBeGreaterThan(-0.5);
  });

  test('track gain, pan and mute reach the mix', () => {
    const half = renderProject(audioProject([], { gain: -6, pan: 1 }), { a1: [sine(440, 2, 0.5)] }, { sampleRate: SR });
    expect(db(peak(half.right, SR / 2, SR))).toBeCloseTo(-12, 1);
    expect(peak(half.left, SR / 2, SR)).toBeLessThan(1e-6);
    const muted = renderProject(audioProject([], { mute: true }), { a1: [sine(440, 2, 0.5)] }, { sampleRate: SR });
    expect(peak(muted.left)).toBeLessThan(1e-6);
  });

  test('the master limiter holds a hot mix at its ceiling', () => {
    const p = audioProject([]);
    p.tracks[0].gain = 6;
    p.master.limiter = { on: true, ceiling: -1, release: 80 };
    const { left, right } = renderProject(p, { a1: [sine(200, 2, 0.9)] }, { sampleRate: SR });
    expect(Math.max(peak(left), peak(right))).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
  });

  test('the starter song renders: synth notes, effects and a reverb tail, deterministically', () => {
    const p = starterProject();
    const a = renderProject(p, {}, { sampleRate: SR });
    const b = renderProject(p, {}, { sampleRate: SR });
    const songEnd = Math.round(8 * 0.625 * SR); // 8 beats at 96 BPM
    expect(a.left.length).toBeGreaterThan(songEnd);
    expect(peak(a.left, 0, songEnd)).toBeGreaterThan(0.05);
    expect(peak(a.left)).toBeLessThan(1);
    expect(peak(a.left, songEnd + SR * 0.2, songEnd + SR * 0.4)).toBeGreaterThan(1e-4); // the tail rings on
    let diff = 0;
    for (let i = 0; i < a.left.length; i++) diff = Math.max(diff, Math.abs(a.left[i] - b.left[i]));
    expect(diff).toBe(0);
  });

  test('a synth note starts on its beat, sample-accurately', () => {
    const p = normalizeProject({ bpm: 120, tracks: [{ id: 's', kind: 'synth', synth: { preset: 'pluck' }, clips: [{ id: 'c', start: 2, len: 4, notes: [{ p: 60, t: 0, d: 1, v: 1 }] }] }], master: { limiter: { on: false } } });
    const { left } = renderProject(p, {}, { sampleRate: SR });
    const onset = SR; // beat 2 at 120 BPM = 1 s
    expect(peak(left, 0, onset)).toBe(0);
    expect(peak(left, onset, onset + 256)).toBeGreaterThan(0);
  });

  test('WAV export round-trips at 24 and 16 bit', () => {
    const left = sine(1000, 0.1, 0.5); const right = sine(500, 0.1, -0.25);
    for (const bits of [24, 16]) {
      const back = decodeWav(encodeWav({ left, right }, SR, bits));
      expect(back.sampleRate).toBe(SR);
      let err = 0;
      for (let i = 0; i < left.length; i++) err = Math.max(err, Math.abs(back.channels[0][i] - left[i]), Math.abs(back.channels[1][i] - right[i]));
      expect(err).toBeLessThan(bits === 24 ? 1e-6 : 1e-4);
    }
  });
});

describe('live engine', () => {
  test('loop wraps exactly at the loop end and the metronome clicks on the beat', () => {
    const e = new Engine(SR);
    e.setProject(normalizeProject({ bpm: 120, metronome: true, loop: { on: true, start: 0, end: 1 }, tracks: [] }));
    e.play(0);
    const L = new Float32Array(128); const R = new Float32Array(128);
    let blocks = 0; let wrapped = false; let last = 0;
    while (blocks++ < 400) { e.process(L, R, 128); if (e.beat < last) wrapped = true; last = e.beat; }
    expect(wrapped).toBe(true);
    expect(e.beat).toBeLessThan(1);
    e.stop(); e.seek(0); e.play(0);
    e.process(L, R, 128);
    expect(peak(L)).toBeGreaterThan(0.01); // downbeat click
  });

  test('solo silences the other tracks', () => {
    const e = new Engine(SR, { offline: true });
    const p = normalizeProject({ tracks: [
      { id: 'a', kind: 'audio', solo: true, clips: [{ id: 'x', asset: 'a1', start: 0, dur: 1 }] },
      { id: 'b', kind: 'audio', clips: [{ id: 'y', asset: 'a2', start: 0, dur: 1 }] },
    ], master: { limiter: { on: false } } });
    e.setProject(p); e.setAsset('a1', [sine(300, 1, 0.3)]); e.setAsset('a2', [sine(3000, 1, 0.3)]);
    e.play(0);
    const L = new Float32Array(SR / 4); const R = new Float32Array(SR / 4);
    for (let at = 0; at < L.length; at += 128) e.process(L.subarray(at, at + 128), R.subarray(at, at + 128), 128);
    expect(tone(L, 300, 2000, L.length)).toBeGreaterThan(0.25);
    expect(tone(L, 3000, 2000, L.length)).toBeLessThan(1e-4);
  });

  test('project normalisation clamps values and keeps the effect chain', () => {
    const p = normalizeProject({ bpm: 9999, tracks: [{ kind: 'synth', fx: [newEffect('delay'), { type: 'nope' }], gain: 40, clips: [{ len: 4, notes: [{ p: 300, t: 1 }] }] }] });
    expect(p.bpm).toBe(300);
    expect(p.tracks[0].gain).toBe(6);
    expect(p.tracks[0].fx.map(f => f.type)).toEqual(['delay']);
    expect(p.tracks[0].clips[0].notes[0].p).toBe(127);
    expect(snapBeats('1/16')).toBe(0.25);
    expect(snapBeats('off')).toBe(0);
  });
});
