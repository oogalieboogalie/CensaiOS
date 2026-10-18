import { toMelody, onTheBeat, barRoots, barsFor, noteName } from '../src/lib/hum/melody.js';
import { buildSong, normalizeSettings, drumBar, BEATS } from '../src/lib/hum/beat.js';
import { songToMidi } from '../src/lib/hum/midiFile.js';
import { renderProject } from '../src/lib/studio/render.js';
import { DrumKit } from '../src/lib/studio/dsp/drums.js';
import { EXAMPLE_HUM } from '../src/components/windows/humBeat/example.js';

const rms = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, to - from)); };

describe('a hum becomes one clean melody', () => {
  test('overtones and quiet overlaps give way to the louder note; blips are dropped', () => {
    const heard = [
      { pitchMidi: 60, startTimeSeconds: 0, durationSeconds: 0.5, amplitude: 0.8 },
      { pitchMidi: 72, startTimeSeconds: 0.1, durationSeconds: 0.3, amplitude: 0.3 }, // overtone, quieter
      { pitchMidi: 61, startTimeSeconds: 0.6, durationSeconds: 0.02, amplitude: 0.5 }, // blip
      { pitchMidi: 64, startTimeSeconds: 0.7, durationSeconds: 0.4, amplitude: 0.7 },
    ];
    expect(toMelody(heard).map(n => n.p)).toEqual([60, 64]);
  });

  test('a note that wavered into two pieces is joined back into one', () => {
    const m = toMelody([{ p: 67, s: 0, d: 0.3, v: 0.7 }, { p: 67, s: 0.33, d: 0.3, v: 0.7 }]);
    expect(m).toHaveLength(1);
    expect(m[0].d).toBeCloseTo(0.63);
  });

  test('notes line up with the beat, starting on beat one', () => {
    const notes = onTheBeat([{ p: 60, s: 1.02, d: 0.31, v: 1 }, { p: 62, s: 1.36, d: 0.3, v: 1 }], { bpm: 90, grid: 0.5 });
    expect(notes.map(n => [n.t, n.d])).toEqual([[0, 0.5], [0.5, 0.5]]);
    expect(onTheBeat([{ p: 60, s: 0, d: 0.3, v: 1 }], { octave: -1 })[0].p).toBe(48);
  });

  test('the bassline follows the note each bar leans on', () => {
    const notes = [{ p: 69, t: 0, d: 3, v: 1 }, { p: 64, t: 3, d: 1, v: 1 }, { p: 67, t: 4, d: 4, v: 1 }];
    expect(barRoots(notes, barsFor(notes))).toEqual([9, 7]);
    expect(noteName(69)).toBe('A4');
  });
});

describe('the beat built around it', () => {
  test('every beat style has a whole bar of steps', () => {
    for (const [id, beat] of Object.entries(BEATS)) {
      for (const row of ['kick', 'snare', 'clap', 'hat', 'openHat', 'bass']) if (beat[row]) expect([id, row, beat[row].length]).toEqual([id, row, 16]);
    }
    expect(drumBar('house').filter(n => n.p === 36).map(n => n.t)).toEqual([0, 1, 2, 3]);
  });

  test('the example hum makes a looping song with melody, drums and bass', () => {
    const song = buildSong(toMelody(EXAMPLE_HUM), { style: 'boomBap' });
    expect(song.tracks.map(t => [t.name, t.synth.preset])).toEqual([['Melody', 'keys'], ['Drums', 'drums'], ['Bass', 'bass']]);
    expect(song.bpm).toBe(90);
    expect(song.loop).toMatchObject({ on: true, start: 0, end: 16 });
    expect(song.tracks[0].clips[0].notes.length).toBeGreaterThan(12);
    // Rebuilding gives the same ids, so the engine keeps its effects warm.
    expect(buildSong(toMelody(EXAMPLE_HUM), {}).tracks[0].fx.map(f => f.id)).toEqual(song.tracks[0].fx.map(f => f.id));
    expect(buildSong(toMelody(EXAMPLE_HUM), { style: 'none', bass: false }).tracks).toHaveLength(1);
  });

  test('settings are checked before use', () => {
    expect(normalizeSettings({ style: 'polka', bpm: 9999, instrument: 'kazoo', grid: 3, octave: 7 }))
      .toEqual({ style: 'boomBap', bpm: 200, instrument: 'keys', grid: 0.5, octave: 2, bass: true });
  });

  test('the song really sounds: drums and melody both make noise through the Studio engine', () => {
    const song = buildSong(toMelody(EXAMPLE_HUM), { style: 'boomBap' });
    const sr = 22050;
    const solo = id => renderProject({ ...song, tracks: song.tracks.filter(t => t.id === id) }, {}, { sampleRate: sr });
    expect(rms(solo('hum-drums').left)).toBeGreaterThan(0.01);
    expect(rms(solo('hum-melody').left)).toBeGreaterThan(0.005);
    const mix = renderProject(song, {}, { sampleRate: sr });
    expect(mix.left.length / sr).toBeGreaterThan(10);
    expect(mix.left.reduce((m, x) => Math.max(m, Math.abs(x)), 0)).toBeLessThanOrEqual(1);
  });

  test('a kick is low and short, a hat is bright and shorter', () => {
    const hit = (note) => { const k = new DrumKit(48000); k.noteOn(note, 1); const L = new Float32Array(48000); const R = new Float32Array(48000); k.render(L, R, 0, 48000); return L; };
    const kick = hit(36); const hat = hit(42);
    expect(rms(kick, 0, 4800)).toBeGreaterThan(rms(kick, 33600, 38400) * 20);
    expect(rms(hat, 9600, 14400)).toBeLessThan(1e-6);
    let crossings = 0; for (let i = 1; i < 2400; i++) if ((hat[i - 1] < 0) !== (hat[i] < 0)) crossings++;
    expect(crossings).toBeGreaterThan(300);
  });
});

describe('MIDI file', () => {
  test('a valid type 1 file with a tempo track, the drums on channel 10', () => {
    const song = buildSong(toMelody(EXAMPLE_HUM), { style: 'trap' });
    const bytes = songToMidi(song);
    const ascii = (i) => String.fromCharCode(...bytes.slice(i, i + 4));
    expect(ascii(0)).toBe('MThd');
    expect([bytes[9], bytes[11]]).toEqual([1, 1 + song.tracks.length]);
    // Walk the chunks: each MTrk length must land exactly on the next chunk.
    let at = 14; let count = 0;
    while (at < bytes.length) { expect(ascii(at)).toBe('MTrk'); const len = (bytes[at + 4] << 24) | (bytes[at + 5] << 16) | (bytes[at + 6] << 8) | bytes[at + 7]; at += 8 + len; count++; }
    expect(at).toBe(bytes.length);
    expect(count).toBe(1 + song.tracks.length);
    expect(bytes.includes(0x99)).toBe(true); // note-on, channel 10
    const tempo = (bytes[14 + 8 + 4] << 16) | (bytes[14 + 8 + 5] << 8) | bytes[14 + 8 + 6];
    expect(Math.round(60000000 / tempo)).toBe(140);
  });
});
