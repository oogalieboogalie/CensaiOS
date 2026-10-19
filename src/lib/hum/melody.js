// Turns what the note finder heard into one clean melody. A hum is one
// voice, but the model also reports overtones, breaths and wobbles, so this
// keeps the loudest note at any moment, drops blips, joins a note that
// wavered into two, then lines the result up with the beat.

export const MAX_HEARD = 600;
const MIN_SECONDS = 0.07;

const num = (v, fb) => (Number.isFinite(+v) ? +v : fb);

/** Notes as saved on the window: { p, s, d, v } with start and length in seconds. */
export function cleanHeard(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_HEARD).map(n => ({
    p: Math.round(Math.min(108, Math.max(21, num(n?.p ?? n?.pitchMidi, 60)))),
    s: Math.max(0, num(n?.s ?? n?.startTimeSeconds, 0)),
    d: Math.max(0.01, num(n?.d ?? n?.durationSeconds, 0.1)),
    v: Math.min(1, Math.max(0.05, num(n?.v ?? n?.amplitude, 0.6))),
  })).sort((a, b) => a.s - b.s);
}

/** One note at a time: where notes overlap the louder one wins and the other is trimmed or dropped. */
export function toMelody(heard, { minSeconds = MIN_SECONDS } = {}) {
  const notes = cleanHeard(heard).filter(n => n.d >= minSeconds * 0.6);
  const out = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    if (!prev || n.s >= prev.s + prev.d) { out.push({ ...n }); continue; }
    if (n.v > prev.v * 1.15) {
      prev.d = n.s - prev.s;
      if (prev.d < minSeconds) out.pop();
      out.push({ ...n });
    } else if (n.s + n.d > prev.s + prev.d && n.p === prev.p) {
      prev.d = n.s + n.d - prev.s;
    }
  }
  // A note that wavered reads as the same pitch twice with a tiny gap: join them.
  const joined = [];
  for (const n of out) {
    const prev = joined[joined.length - 1];
    if (prev && prev.p === n.p && n.s - (prev.s + prev.d) < 0.06) prev.d = n.s + n.d - prev.s;
    else joined.push(n);
  }
  return joined.filter(n => n.d >= minSeconds);
}

/**
 * Melody notes on the beat grid, in beats: { p, t, d, v }. `grid` is the
 * step in beats (0.5 is eighth notes); 0 keeps the timing as hummed. The
 * first note lands on beat one so the beat and the melody start together.
 */
export function onTheBeat(melody, { bpm = 90, grid = 0.5, octave = 0 } = {}) {
  if (!melody.length) return [];
  const bps = bpm / 60;
  const first = melody[0].s;
  const snap = x => (grid > 0 ? Math.round(x / grid) * grid : x);
  const notes = [];
  for (const n of melody) {
    const t = snap((n.s - first) * bps);
    const end = snap((n.s + n.d - first) * bps);
    const d = Math.max(grid > 0 ? grid : 0.125, end - t);
    const prev = notes[notes.length - 1];
    if (prev && t < prev.t + prev.d) {
      if (t <= prev.t) continue; // two hummed notes snapped onto one step: keep the first
      prev.d = t - prev.t;
    }
    notes.push({ p: Math.min(127, Math.max(0, n.p + octave * 12)), t, d, v: n.v });
  }
  return notes;
}

/** Length in whole bars, at least two so a short hum still loops as a beat. */
export function barsFor(notes, beatsPerBar = 4) {
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  return Math.min(32, Math.max(2, Math.ceil((end - 1e-6) / beatsPerBar)));
}

/** The note each bar leans on most (longest total time), as a pitch class 0-11, for the bassline. */
export function barRoots(notes, bars, beatsPerBar = 4) {
  let carry = notes[0] ? notes[0].p % 12 : 0;
  return Array.from({ length: bars }, (_, b) => {
    const weight = new Map();
    const from = b * beatsPerBar; const to = from + beatsPerBar;
    for (const n of notes) {
      const overlap = Math.min(to, n.t + n.d) - Math.max(from, n.t);
      if (overlap > 0) weight.set(n.p % 12, (weight.get(n.p % 12) || 0) + overlap + (n.t === from ? 0.5 : 0));
    }
    if (weight.size) carry = [...weight.entries()].sort((a, c) => c[1] - a[1])[0][0];
    return carry;
  });
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = p => `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
