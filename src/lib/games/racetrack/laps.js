// Lap timing for a drawn track. The start line sits on the first point of
// the stroke. The loop is cut into SECTORS; a lap counts only when the car
// crosses the line going forward having been through every sector since it
// last crossed, so cutting across the infield or reversing over the line
// doesn't score. Time is whatever clock the caller passes (seconds).

export const SECTORS = 8;
const ALL = (1 << SECTORS) - 1;

export function createLaps() {
  return { lastS: null, seen: 0, started: false, lapStart: 0, laps: 0, last: null, best: null };
}

function sectorOf(s, length) {
  return Math.min(SECTORS - 1, Math.max(0, Math.floor((s / length) * SECTORS)));
}

/**
 * Feed the car's distance along the loop (0..length) at time `now`.
 * Returns `{ started, lap }`: started is true on the crossing that starts the
 * clock, lap is the finished lap's time in seconds (or null).
 */
export function updateLaps(state, s, length, now) {
  const out = { started: false, lap: null, best: false };
  if (!(length > 0) || !Number.isFinite(s)) return out;
  if (state.lastS === null) {
    state.lastS = s;
    state.seen = 1 << sectorOf(s, length);
    return out;
  }
  const delta = s - state.lastS;
  if (delta < -length / 2) {
    // Over the line, going forward.
    if (!state.started) {
      state.started = true;
      out.started = true;
    } else if (state.seen === ALL) {
      const lap = now - state.lapStart;
      state.laps += 1;
      state.last = lap;
      if (state.best === null || lap < state.best) { state.best = lap; out.best = true; }
      out.lap = lap;
    }
    state.lapStart = now;
    state.seen = 0;
  } else if (delta > length / 2) {
    // Back over the line the wrong way: this lap no longer counts.
    state.seen = 0;
  }
  state.seen |= 1 << sectorOf(s, length);
  state.lastS = s;
  return out;
}

/** The running lap's time, or 0 before the clock starts. */
export function currentLap(state, now) {
  return state.started ? Math.max(0, now - state.lapStart) : 0;
}

/** 63.456 -> "1:03.456"; 9.1 -> "9.100". */
export function formatLap(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const ms = Math.round(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = String(ms % 1000).padStart(3, '0');
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}.${rest}` : `${s}.${rest}`;
}

export const BEST_LAPS_SIZE = 5;

/** Merge a lap into the board's best-lap table: fastest first, one row per driver. */
export function mergeBestLaps(table, entry, size = BEST_LAPS_SIZE) {
  const rows = [...(Array.isArray(table) ? table : []), entry]
    .map((row) => ({ name: String(row?.name || 'Driver').slice(0, 40), ms: Math.round(Number(row?.ms)), at: Number(row?.at) || 0 }))
    .filter((row) => Number.isFinite(row.ms) && row.ms > 0)
    .sort((a, b) => a.ms - b.ms || a.at - b.at);
  const seen = new Set();
  return rows.filter((row) => (seen.has(row.name) ? false : seen.add(row.name))).slice(0, size);
}
