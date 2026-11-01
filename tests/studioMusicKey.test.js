import { inScale, nearestInScale, fitToScale, quantizeNotes, guessKey, keyLabel } from '../src/lib/studio/musicKey.js';
import { normalizeProject, starterProject } from '../src/lib/studio/project.js';
import { edits } from '../src/lib/studio/edit.js';
import { assistContext, planAssist, describeEffects, cleanNotes } from '../src/lib/studio/assist.js';

describe('Studio key and scale', () => {
  test('a saved song keeps its key, scale and lock; bad values fall back', () => {
    expect(normalizeProject({ key: 7, scale: 'minor', scaleLock: true })).toMatchObject({ key: 7, scale: 'minor', scaleLock: true });
    expect(normalizeProject({ key: 40, scale: 'lydian' })).toMatchObject({ key: 11, scale: 'major', scaleLock: false });
    expect(keyLabel(starterProject().key, starterProject().scale)).toBe('A minor');
  });

  test('notes outside the key move to the nearest note in it, ties go down', () => {
    expect(inScale(61, 0, 'major')).toBe(false);
    expect(nearestInScale(61, 0, 'major')).toBe(60);
    expect(nearestInScale(66, 0, 'major')).toBe(65);
    expect(fitToScale([{ p: 63, t: 0, d: 1, v: 1 }], 9, 'minor')[0].p).toBe(62);
    expect(fitToScale([{ p: 64, t: 0, d: 1, v: 1 }], 9, 'minor')[0].p).toBe(64);
  });

  test('quantize puts notes on the grid and joins doubles', () => {
    const out = quantizeNotes([{ p: 60, t: 0.1, d: 0.4, v: 1 }, { p: 60, t: -0.05, d: 0.2, v: 1 }, { p: 62, t: 3.9, d: 1, v: 1 }], 0.5, 4);
    expect(out).toEqual([{ p: 60, t: 0, d: 0.5, v: 1 }]);
  });

  test('guessKey hears a minor tune as minor', () => {
    const tune = [57, 60, 64, 62, 60, 59, 57, 64, 57, 53, 52].map((p, i) => ({ p, t: i, d: p === 57 ? 2 : 1 }));
    expect(guessKey(tune)).toMatchObject({ key: 9, scale: 'minor' });
    expect(guessKey([{ p: 60, d: 1 }])).toBeNull();
  });

  test('a new track can arrive with its name, sound and first clip', () => {
    const p = edits.addTrack(starterProject(), 'synth', { name: 'Hummed melody', synth: { preset: 'lead' }, clips: [{ start: 4, len: 8, notes: [{ p: 60, t: 0, d: 1, v: 1 }] }] });
    const t = p.tracks.at(-1);
    expect(t).toMatchObject({ name: 'Hummed melody', kind: 'synth', synth: { preset: 'lead' } });
    expect(t.clips[0]).toMatchObject({ kind: 'midi', start: 4, len: 8 });
    expect(t.clips[0].id).toMatch(/^clip-/);
  });
});

describe('Studio model box', () => {
  const song = () => normalizeProject({ ...starterProject(), scaleLock: true });

  test('the model is told the song, the track and every real effect with its range', () => {
    const text = assistContext(song(), 'track-audio');
    expect(text).toContain('96 BPM');
    expect(text).toContain('key A minor');
    expect(text).toContain('"Vocals", an audio track');
    expect(describeEffects()).toContain('- delay (Delay');
    expect(describeEffects()).toContain('feedback 0..95 %');
    expect(assistContext(song(), 'track-bass')).toContain('You may write new notes');
  });

  test('effects come back clamped, unknown ones are skipped, add keeps the old chain', () => {
    const plan = planAssist(song(), 'track-bass', { fx: [{ type: 'delay', params: { feedback: 400, division: '1/4' } }, { type: 'flanger' }] });
    expect(plan.fx.map(f => f.type)).toEqual(['saturation', 'delay']);
    expect(plan.fx[1].params).toMatchObject({ feedback: 95, division: '1/4' });
    expect(plan.done.join(' ')).toMatch(/Added Delay.*skipped 1/);
  });

  test('replace swaps the chain; master works too', () => {
    const plan = planAssist(song(), 'master', { fx: [{ type: 'limiter', params: { ceiling: -0.3 } }], fxMode: 'replace' });
    expect(plan.fx.map(f => f.type)).toEqual(['limiter']);
    expect(plan.clip).toBeNull();
  });

  test('notes for a synth track become a clip in the key; audio tracks never get notes', () => {
    const reply = { notes: [{ p: 61, t: 0, d: 1 }, { p: 64, t: 1, d: 1 }], len: 4, preset: 'pluck' };
    const plan = planAssist(song(), 'track-bass', reply, { atBeat: 8 });
    expect(plan.clip).toMatchObject({ start: 8, len: 4 });
    expect(plan.clip.notes.map(n => n.p)).toEqual([60, 64]);
    expect(plan.preset).toBe('pluck');
    expect(planAssist(song(), 'track-audio', reply).clip).toBeNull();
    expect(cleanNotes([{ p: 999, t: -3, d: 0 }], 4)[0]).toEqual({ p: 127, t: 0, d: 1 / 32, v: 0.8 });
  });

  test('an answer with nothing usable changes nothing', () => {
    expect(planAssist(song(), 'track-audio', { say: 'I cannot do that' })).toMatchObject({ fx: null, clip: null, preset: null, done: [] });
  });
});

test('notes from the model never land on top of the track\'s own clips', () => {
  const song = starterProject(); // the bass clip covers beats 0-8
  const plan = planAssist(song, 'track-bass', { notes: [{ p: 45, t: 0, d: 1 }], len: 16 }, { atBeat: 2 });
  expect(plan.clip.start).toBe(8);
  expect(planAssist(song, 'track-bass', { notes: [{ p: 45, t: 0, d: 1 }], len: 4 }, { atBeat: 12 }).clip.start).toBe(12);
});

test('a "replace" answer with no usable effect leaves the chain alone', () => {
  const plan = planAssist(starterProject(), 'track-keys', { fxMode: 'replace', fx: [{ type: 'flanger' }] });
  expect(plan.fx).toBeNull();
});
