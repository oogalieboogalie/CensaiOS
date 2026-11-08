import { BEST_LAPS_SIZE } from './laps.js';

// The best-lap table rides the shared board, so any teammate's browser can
// write anything into it. This keeps only rows a person could have set: a
// short name in words and a lap time in milliseconds. Anything else (an empty
// row, a name that is a list or an object, a time that is not a number) is
// dropped, so the table always draws.

/** Clean rows from the window's bestLaps, fastest first, one per name. */
export function readBestLaps(raw, size = BEST_LAPS_SIZE) {
  const rows = (Array.isArray(raw) ? raw : [])
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({
      name: (typeof row.name === 'string' && row.name.trim() ? row.name : 'Driver').slice(0, 40),
      ms: Math.round(Number(row.ms)),
      at: Number(row.at) || 0,
    }))
    .filter((row) => typeof row.ms === 'number' && Number.isFinite(row.ms) && row.ms > 0 && row.ms <= 36_000_000)
    .sort((a, b) => a.ms - b.ms || a.at - b.at);
  const seen = new Set();
  return rows.filter((row) => (seen.has(row.name) ? false : seen.add(row.name))).slice(0, size);
}
