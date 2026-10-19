import { normalizeProject } from '../studio/project.js';
import { newEffect } from '../studio/effects.js';
import { DRUM_NOTES } from '../studio/dsp/drums.js';
import { onTheBeat, barsFor, barRoots } from './melody.js';

// Builds a Studio song from a hummed melody: the melody on an instrument,
// a drum pattern under it and, if wanted, a bassline that follows the note
// each bar leans on. The result is a normal Studio project, so it plays
// through the Studio engine and opens in the Studio window unchanged.

const { kick: K, snare: S, clap: C, hat: H, openHat: O } = DRUM_NOTES;

// One bar of sixteenth steps per drum: 'x' hits, '-' rests. `bass` steps
// say where the bass plays the bar's root note.
export const BEATS = Object.freeze({
  boomBap: { label: 'Boom bap', bpm: 90, swing: 0.08, kick: 'x-------x-x-----', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', bass: 'x-------x-x-----' },
  trap: { label: 'Trap', bpm: 140, kick: 'x------x--x-----', clap: '--------x-------', hat: 'x-x-x-x-x-xxx-x-', bass: 'x------x--x-----' },
  house: { label: 'Four on the floor', bpm: 122, kick: 'x---x---x---x---', clap: '----x-------x---', openHat: '--x---x---x---x-', hat: 'x-x-x-x-x-x-x-x-', bass: '--x---x---x---x-' },
  lofi: { label: 'Lo-fi', bpm: 80, swing: 0.12, kick: 'x-----x---x-----', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', bass: 'x-----x---------' },
  rock: { label: 'Rock', bpm: 110, kick: 'x-------x-x-----', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', bass: 'x-x-x-x-x-x-x-x-' },
  none: { label: 'No drums', bpm: 90, bass: 'x-------x-------' },
});

export const INSTRUMENTS = Object.freeze({
  keys: 'Piano keys', pluck: 'Pluck', lead: 'Lead synth', pad: 'Soft pad', bass: 'Bass synth',
});

const DRUM_ROWS = [['kick', K], ['snare', S], ['clap', C], ['hat', H], ['openHat', O]];

/** One bar's drum hits in beats, with light swing on the off-beat sixteenths. */
export function drumBar(style, bar = 0) {
  const beat = BEATS[style] || BEATS.boomBap;
  const out = [];
  for (const [row, p] of DRUM_ROWS) {
    const steps = beat[row];
    if (!steps) continue;
    for (let i = 0; i < 16; i++) {
      if (steps[i] !== 'x') continue;
      const swing = i % 2 === 1 ? beat.swing || 0 : 0;
      // Hats a little quieter on the off-beats so the groove breathes.
      const v = row === 'hat' ? (i % 4 === 0 ? 0.75 : 0.5) : row === 'kick' && i === 0 ? 1 : 0.85;
      out.push({ p, t: bar * 4 + i / 4 + swing, d: 0.25, v });
    }
    // Trap hats: a quick roll at the end of every other bar.
    if (style === 'trap' && row === 'hat' && bar % 2 === 1) {
      for (let j = 0; j < 4; j++) out.push({ p, t: bar * 4 + 3.5 + j / 8, d: 0.125, v: 0.45 });
    }
  }
  return out;
}

export function bassFor(style, roots) {
  const steps = (BEATS[style] || BEATS.boomBap).bass;
  const out = [];
  roots.forEach((pc, bar) => {
    for (let i = 0; i < 16; i++) {
      if (steps[i] !== 'x') continue;
      const next = steps.indexOf('x', i + 1);
      const len = ((next === -1 ? 16 : next) - i) / 4;
      out.push({ p: 36 + pc, t: bar * 4 + i / 4, d: Math.max(0.25, len * 0.9), v: 0.85 });
    }
  });
  return out;
}

/** Window settings, each one checked: what the hum window saves next to the heard notes. */
export function normalizeSettings(s = {}) {
  const style = BEATS[s.style] ? s.style : 'boomBap';
  return {
    style,
    bpm: Math.round(Math.min(200, Math.max(50, Number.isFinite(+s.bpm) && s.bpm ? +s.bpm : BEATS[style].bpm))),
    instrument: INSTRUMENTS[s.instrument] ? s.instrument : 'keys',
    grid: [0, 0.25, 0.5, 1].includes(+s.grid) ? +s.grid : 0.5,
    octave: Math.round(Math.min(2, Math.max(-2, +s.octave || 0))),
    bass: s.bass !== false,
  };
}

/** The whole song as a Studio project. */
export function buildSong(melody, settings, title = 'Hummed beat') {
  const s = normalizeSettings(settings);
  const notes = onTheBeat(melody, { bpm: s.bpm, grid: s.grid, octave: s.octave });
  const bars = barsFor(notes);
  const len = bars * 4;
  // Fixed ids, so rebuilding after a setting change keeps the engine's effects warm instead of starting them over.
  const clip = (id, name, ns) => ({ id, start: 0, len, name, notes: ns.filter(n => n.t < len) });
  const fx = (id, type, params) => ({ ...newEffect(type), id, ...(params ? { params: { ...newEffect(type).params, ...params } } : {}) });
  const tracks = [{
    id: 'hum-melody', name: 'Melody', kind: 'synth', synth: { preset: s.instrument },
    fx: [fx('hum-fx-eq', 'eq'), fx('hum-fx-verb', 'reverb', { mix: 18 })],
    clips: [clip('hum-clip-melody', 'Your hum', notes)],
  }];
  if (s.style !== 'none') {
    const drums = Array.from({ length: bars }, (_, b) => drumBar(s.style, b)).flat();
    tracks.push({ id: 'hum-drums', name: 'Drums', kind: 'synth', synth: { preset: 'drums' }, fx: [fx('hum-fx-comp', 'compressor')], clips: [clip('hum-clip-drums', 'Beat', drums)] });
  }
  if (s.bass && notes.length) {
    tracks.push({ id: 'hum-bass', name: 'Bass', kind: 'synth', synth: { preset: 'bass' }, fx: [fx('hum-fx-sat', 'saturation')], clips: [clip('hum-clip-bass', 'Bassline', bassFor(s.style, barRoots(notes, bars)))] });
  }
  return normalizeProject({ title, bpm: s.bpm, tracks, loop: { on: true, start: 0, end: len }, master: { fx: [fx('hum-fx-master', 'eq')] } });
}
