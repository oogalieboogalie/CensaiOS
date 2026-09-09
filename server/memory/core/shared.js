export function clampScore(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(n, 1));
}

export function normalizeSearchQuery(query) {
  return typeof query === 'string' ? query.trim() : String(query || '').trim();
}

export function tokenizeSearchQuery(query) {
  return [...new Set(
    normalizeSearchQuery(query)
      .toLowerCase()
      .split(/[^a-z0-9_-]+/i)
      .map(t => t.trim())
      .filter(t => t.length >= 2)
  )].slice(0, 8);
}

export function likePattern(value) {
  return `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;
}
