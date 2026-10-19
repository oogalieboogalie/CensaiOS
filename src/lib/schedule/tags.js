/**
 * Scheduler tags (Alex's diagram 02): a short colored label on each run's
 * card, like "Maintenance" or "Development". Plain JS so tests can use it.
 */

export const SCHEDULE_TAGS = Object.freeze([
  { id: 'Maintenance', hue: 60 },
  { id: 'Development', hue: 145 },
  { id: 'Research', hue: 230 },
  { id: 'Writing', hue: 300 },
  { id: 'Business', hue: 25 },
]);

/** Same rules as the server: one line, at most 32 characters, empty is none. */
export function cleanTag(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

/** A steady hue for any tag, so a custom tag keeps its color everywhere. */
export function tagHue(tag) {
  const clean = cleanTag(tag);
  const known = SCHEDULE_TAGS.find((t) => t.id.toLowerCase() === clean.toLowerCase());
  if (known) return known.hue;
  let hash = 0;
  for (const ch of clean.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

/** Open to-dos from every To-do List window on the board, newest list first. */
export function openTodosFromBoard(wins = []) {
  const seen = new Set();
  const out = [];
  for (const win of [...wins].reverse()) {
    if (win?.kind !== 'todos' || !Array.isArray(win.items)) continue;
    for (const item of win.items) {
      const text = String(item?.text || '').trim();
      if (!text || item.done || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out.push({ key: `${win.id}:${item.id}`, text, list: win.title || 'To-do List' });
    }
  }
  return out;
}
