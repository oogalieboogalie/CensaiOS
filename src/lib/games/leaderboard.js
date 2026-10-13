// Per-board high scores (spec 11). The table lives on the game window's
// record, so the shared Yjs doc carries it to everyone on the board. Only
// the match host writes it, once per finished match, so two people never
// race to rewrite the same list.

export const LEADERBOARD_SIZE = 10;

function cleanEntry(entry) {
  const score = Number(entry?.score);
  if (!Number.isInteger(score) || score <= 0) return null;
  return {
    name: String(entry?.name || 'Player').slice(0, 40),
    score,
    wave: Number.isInteger(entry?.wave) ? entry.wave : 0,
    at: Number.isFinite(entry?.at) ? entry.at : 0,
  };
}

/** Merge new results into a table: best first, ties go to who got there first. */
export function mergeHighScores(table, results, size = LEADERBOARD_SIZE) {
  const seen = new Set();
  return [...(Array.isArray(table) ? table : []), ...(Array.isArray(results) ? results : [])]
    .map(cleanEntry)
    .filter(Boolean)
    .filter((entry) => {
      const key = `${entry.name}\u0000${entry.score}\u0000${entry.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, size);
}

/** Where a result landed in a table (0-based), or -1 if it didn't make it. */
export function rankOf(table, entry) {
  return (Array.isArray(table) ? table : []).findIndex((row) => row.name === entry?.name && row.score === entry?.score && row.at === entry?.at);
}
