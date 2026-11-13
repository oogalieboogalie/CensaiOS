// Lead contact links come from what an agent saved off the web, so only real
// web addresses become links. A bare "example.com" gets https:// so it opens
// that site instead of a page inside censaiOS; anything else (javascript:,
// data:, mailto: typed into a website field) shows no link at all.
export function webLink(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
