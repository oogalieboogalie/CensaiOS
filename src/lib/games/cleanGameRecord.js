// Game windows keep their match and high-score table on the shared board, so
// anyone on the board can write anything there. These turn what arrives into
// something safe to draw: rows without a real score are dropped, names are
// always short plain words, and a match without a real host counts as none.

const MAX_NAME = 40;

const plainName = (value, fallback) => (typeof value === 'string' && value.trim() ? value.slice(0, MAX_NAME) : fallback);

/** High-score rows fit to show: a whole positive score and a name in words. */
export function cleanScoreRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && Number.isInteger(row.score) && row.score > 0)
    .map((row) => ({ ...row, name: plainName(row.name, 'Player'), at: Number.isFinite(row.at) ? row.at : 0 }));
}

/** The match record, or null when it has no host a person could be. */
export function cleanMatch(match) {
  if (!match || typeof match !== 'object' || typeof match.host !== 'string' || !match.host) return null;
  return {
    host: match.host,
    hostName: plainName(match.hostName, 'Someone'),
    startedAt: Number.isFinite(match.startedAt) ? match.startedAt : 0,
  };
}
