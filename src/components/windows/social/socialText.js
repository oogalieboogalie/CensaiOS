// Small words for the Social window.

export function timeAgo(at, now = Date.now()) {
  const then = new Date(at).getTime();
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

/** "Sam: Their censaiOS is not answering. It may be switched off. Showing what it said 3 h ago." */
export function sourceNote(source) {
  if (!source?.error) return '';
  const when = source.fetchedAt ? ` Showing what it said ${timeAgo(source.fetchedAt)}.` : '';
  return `${source.name}: ${source.error}${when}`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
