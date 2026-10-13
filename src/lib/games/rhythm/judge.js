// Scoring a run: timing windows, combo and multiplier. Pure; the window
// feeds it key presses with times on the audio clock.

export const WINDOWS = [
  { id: 'perfect', label: 'Perfect', within: 0.045, points: 100 },
  { id: 'great', label: 'Great', within: 0.09, points: 70 },
  { id: 'ok', label: 'OK', within: 0.135, points: 40 },
];
export const MISS_AFTER = WINDOWS[WINDOWS.length - 1].within;

export function multiplierFor(combo) {
  return Math.min(4, 1 + Math.floor(combo / 10));
}

export function createRun(chart) {
  return { chart, next: 0, hit: new Set(), score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, great: 0, ok: 0, miss: 0 }, last: null };
}

function judgeOffset(offset) {
  return WINDOWS.find((w) => Math.abs(offset) <= w.within) || null;
}

/** Notes whose window has passed without a hit become misses. */
export function sweep(run, now) {
  while (run.next < run.chart.length) {
    const note = run.chart[run.next];
    if (run.hit.has(note.id)) { run.next += 1; continue; }
    if (now - note.t <= MISS_AFTER) break;
    run.counts.miss += 1;
    run.combo = 0;
    run.last = { kind: 'miss', lane: note.lane, at: now };
    run.next += 1;
  }
  return run;
}

/**
 * A key went down on `lane` at audio time `now`. Hits the nearest unplayed
 * note in that lane inside the widest window; a press with nothing there
 * doesn't break the combo (mashing is its own punishment: no points).
 */
export function press(run, lane, now) {
  sweep(run, now);
  let best = null;
  for (let i = run.next; i < run.chart.length; i += 1) {
    const note = run.chart[i];
    if (note.t - now > MISS_AFTER) break;
    if (note.lane !== lane || run.hit.has(note.id)) continue;
    const off = now - note.t;
    if (!best || Math.abs(off) < Math.abs(best.off)) best = { note, off };
  }
  if (!best) return null;
  const grade = judgeOffset(best.off);
  if (!grade) return null;
  run.hit.add(best.note.id);
  run.combo += 1;
  run.maxCombo = Math.max(run.maxCombo, run.combo);
  run.counts[grade.id] += 1;
  run.score += grade.points * multiplierFor(run.combo);
  run.last = { kind: grade.id, label: grade.label, lane, at: now, off: best.off };
  return run.last;
}

/** 0..1: how close to perfect the run was. */
export function accuracy(run) {
  const total = run.chart.length;
  if (!total) return 0;
  const c = run.counts;
  return (c.perfect + c.great * 0.7 + c.ok * 0.4) / total;
}

export function gradeFor(acc) {
  if (acc >= 0.95) return 'S';
  if (acc >= 0.85) return 'A';
  if (acc >= 0.7) return 'B';
  if (acc >= 0.5) return 'C';
  return 'D';
}

export function summary(run) {
  const acc = accuracy(run);
  return { score: run.score, maxCombo: run.maxCombo, accuracy: Math.round(acc * 1000) / 10, grade: gradeFor(acc), counts: { ...run.counts }, notes: run.chart.length };
}
