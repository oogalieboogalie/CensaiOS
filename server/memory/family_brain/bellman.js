// Plain memory ranking for the open source build: newest first.
function timeOf(row) {
  const value = Date.parse(row?.created_at ?? row?.timestamp ?? '');
  return Number.isFinite(value) ? value : 0;
}

export function rankMemories(rows, limit = 12) {
  return (rows || [])
    .map((row) => ({ ...row, _score: timeOf(row) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
