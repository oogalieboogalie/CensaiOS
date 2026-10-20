// The drafts a saved lead keeps (LeadHound's 7-day sequence and ice breaker)
// and the website key used to spot the same lead saved twice.

const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function cleanSequence(value) {
  if (!Array.isArray(value)) return [];
  const days = [];
  for (const row of value) {
    const day = Number(row?.day);
    const body = clip(row?.body, 2000);
    if (!Number.isInteger(day) || day < 1 || day > 7 || !body || days.some((d) => d.day === day)) continue;
    days.push({ day, channel: clip(row.channel, 30).toLowerCase() || 'email', subject: clip(row.subject, 200), body });
  }
  return days.sort((a, b) => a.day - b.day);
}

export function cleanIceBreaker(value) {
  if (!value || typeof value !== 'object') return null;
  const ib = {
    title: clip(value.title, 160),
    format: clip(value.format, 80),
    opening_line: clip(value.opening_line, 400),
    deliverable: clip(value.deliverable, 6000),
    cta: clip(value.cta, 300),
  };
  return ib.title || ib.deliverable ? ib : null;
}

// The site's host, lower case and without "www." — the same rule the
// database uses (SITE_KEY_SQL) so a lead from another page of the same site
// still counts as the same site.
export function siteKey(website) {
  const match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([^/:?#\s]+)/.exec(String(website ?? '').trim().toLowerCase());
  return match?.[1] || null;
}

export const SITE_KEY_SQL = `substring(lower(btrim(website)) from '^(?:[a-z][a-z0-9+.-]*://)?(?:www\\.)?([^/:?#[:space:]]+)')`;
