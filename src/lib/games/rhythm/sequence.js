// Turns a song into timed sound events and a note chart. Pure.
//
// Times are seconds from the first beat. Lead notes become the chart: each
// pitch goes to a lane by its rank among the song's pitches, so a rising
// melody walks across the lanes the way your fingers would on a fret board.

export const LANES = 4;
export const STEPS_PER_BAR = 16;
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', every: 4 },
  { id: 'normal', label: 'Normal', every: 2 },
  { id: 'hard', label: 'Hard', every: 1 },
];

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** "A4" -> 69, "C#5" -> 73; null for anything else. */
export function midiOf(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(String(name));
  if (!m) return null;
  return 12 * (Number(m[2]) + 1) + NOTE_INDEX[m[1]];
}

export function freqOf(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function tokens(line) {
  const out = String(line || '').trim().split(/\s+/).filter(Boolean);
  return out.length ? out : Array(STEPS_PER_BAR).fill('.');
}

// A melodic line: note names start notes, '-' holds, '.' rests.
function melodic(line, voice, barStart, step) {
  const events = [];
  let current = null;
  tokens(line).forEach((tok, i) => {
    if (tok === '-') { if (current) current.dur += step; return; }
    current = null;
    const midi = midiOf(tok);
    if (midi === null) return;
    current = { voice, t: barStart + i * step, dur: step, midi, step: i };
    events.push(current);
  });
  return events;
}

function drums(line, barStart, step) {
  const map = { k: 'kick', s: 'snare', h: 'hat' };
  return tokens(line).map((tok, i) => (map[tok] ? { voice: map[tok], t: barStart + i * step, dur: step, step: i } : null)).filter(Boolean);
}

/** Every sound in the song, in time order, and its length in seconds. */
export function sequence(song) {
  const step = 60 / song.bpm / 4;
  const barLen = step * STEPS_PER_BAR;
  const events = [];
  let bar = 0;
  for (const section of song.sections) {
    const bars = Math.max(section.lead?.length || 0, section.bass?.length || 0, section.drums?.length || 0);
    for (let b = 0; b < bars; b += 1) {
      const start = bar * barLen;
      events.push(...melodic(section.lead?.[b], 'lead', start, step));
      events.push(...melodic(section.bass?.[b], 'bass', start, step));
      events.push(...drums(section.drums?.[b], start, step));
      bar += 1;
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { events, duration: bar * barLen, step };
}

/** Lane for each distinct pitch, spread evenly across the lanes by rank. */
export function laneMap(pitches) {
  const sorted = [...new Set(pitches)].sort((a, b) => a - b);
  const lanes = new Map();
  sorted.forEach((p, i) => lanes.set(p, sorted.length <= 1 ? 0 : Math.min(LANES - 1, Math.floor((i / sorted.length) * LANES))));
  return lanes;
}

/**
 * The note chart for a song at a difficulty: [{ id, t, lane }]. Easier
 * levels keep only the notes on the beat (or on the eighth), and never two
 * notes closer than a playable gap.
 */
export function chartFor(song, difficulty = 'normal') {
  const diff = DIFFICULTIES.find((d) => d.id === difficulty) || DIFFICULTIES[1];
  const { events, step } = sequence(song);
  const lead = events.filter((e) => e.voice === 'lead');
  const lanes = laneMap(lead.map((e) => e.midi));
  const minGap = step * diff.every * 0.99;
  const notes = [];
  for (const e of lead) {
    if (e.step % diff.every !== 0) continue;
    if (notes.length && e.t - notes[notes.length - 1].t < minGap) continue;
    notes.push({ id: notes.length, t: e.t, lane: lanes.get(e.midi) });
  }
  return notes;
}
