// The other names Add (Ctrl+K) finds a window or ready-made board by: the
// names the board itself shows for it, besides its own. A row found only by
// another name is listed after the rows whose own name or description holds
// what was typed (addPaletteItems.js), and reads that other name.

import { LAUNCHPAD_BOARDS, LAUNCHPAD_STARTS } from '../launchpadStarts.js';

const START_NAMES = new Map(LAUNCHPAD_STARTS.map(s => [s.kind, s.label]));
const CHIP_NAMES = new Map(LAUNCHPAD_BOARDS.map(b => [`board:${b.id}`, b.label]));

/** `names` other than `label`, each once, ignoring case. */
function otherNames(label, names) {
  const seen = new Set([String(label || '').trim().toLowerCase()]);
  return names.filter((name) => {
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A window's other names on the board: the empty board's starting button
 * for it ("Find leads" opens LeadHound) and the title its header shows
 * (manifest `header.title`: Files' is "Project files").
 */
export function windowNames(manifest) {
  return otherNames(manifest?.label, [START_NAMES.get(manifest?.kind), manifest?.header?.title]);
}

/** A ready-made board row, also named as its chip on the empty board names it ("Real Estate"). */
export function withChipName(item) {
  const names = otherNames(item.label, [CHIP_NAMES.get(item.id)]);
  return names.length ? { ...item, names } : item;
}

const words = (query) => String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
const spaced = (text) => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;

/**
 * Whether every typed word starts a word of `name`: "proj" and "files" find
 * "Project files"; letters inside a word ("o", "ject") do not, so a name
 * does not flicker in and out while someone types.
 */
export function startsWords(query, name) {
  const typed = words(query);
  const hay = spaced(name);
  return typed.length > 0 && typed.every(w => hay.includes(spaced(w)));
}

/**
 * The row as a search shows it: by another of its names when that name is
 * exactly what was typed, or when only that name holds the words typed
 * ("project" lists Files as "Project files"). Its hint then starts with the
 * module's own name, so the row still says what it adds.
 */
export function shownAs(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !item.names || item.label.toLowerCase() === q) return item;
  const holds = words(q).every(w => item.label.toLowerCase().includes(w));
  const name = item.names.find(n => n.toLowerCase() === q) || (holds ? null : item.names.find(n => startsWords(q, n)));
  if (!name) return item;
  return { ...item, label: name, hint: item.hint ? `${item.label} · ${item.hint}` : item.label, ownLabel: item.label };
}
