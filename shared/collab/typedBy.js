// Who typed what in shared words. Each run of letters in a Y.Text carries a
// mark with the name (`by`) and id (`byId`) of the person whose typing put it
// there, kept as invisible text formatting, so the words themselves never
// change and every copy of the board agrees. Letters without a mark were
// there before marks were kept (or came in from a file) and read as "not
// recorded". Used by the browser (yCanvasSync.js) and the server
// (serverWriter.js, where an agent's edit is marked as an agent's).

const MAX_NAME = 40;
const MAX_ID = 64;

/** Letters an agent wrote through the server. */
export const AGENT_TYPED = Object.freeze({ by: 'An agent', byId: 'agent' });

const clean = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** The mark for letters typed by `name` (with `id`); both null when nobody is signed in. */
export function typedByMark(name, id = null) {
  const by = clean(name, MAX_NAME);
  return { by, byId: by ? clean(id == null ? null : String(id), MAX_ID) : null };
}

/**
 * A Y.Text's delta (text.toDelta()) as runs of letters by one writer:
 * [{ text, by, byId }], next-door runs by the same person joined.
 */
export function writerRuns(delta) {
  const runs = [];
  for (const part of Array.isArray(delta) ? delta : []) {
    if (typeof part?.insert !== 'string' || !part.insert) continue;
    const by = clean(part.attributes?.by, MAX_NAME);
    const byId = by ? clean(part.attributes?.byId, MAX_ID) : null;
    const last = runs[runs.length - 1];
    if (last && last.by === by && last.byId === byId) last.text += part.insert;
    else runs.push({ text: part.insert, by, byId });
  }
  return runs;
}

/** Everyone who wrote in `runs`, most letters first: [{ key, name, byId, letters }]. */
export function writerList(runs) {
  const people = new Map();
  for (const run of runs || []) {
    const key = run.by ? `${run.byId ?? ''}\u0000${run.by}` : '';
    const entry = people.get(key) || { key, name: run.by, byId: run.byId, letters: 0 };
    entry.letters += run.text.length;
    people.set(key, entry);
  }
  return [...people.values()].sort((a, b) => b.letters - a.letters || String(a.name).localeCompare(String(b.name)));
}

const hueOf = (seed) => {
  let hash = 0;
  for (const ch of String(seed ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
};
const apart = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const MIN_APART = 40;

/**
 * A colour for each writer in `people` (writerList), keyed by their `key`:
 * each starts from a hue picked by who they are and steps round the colour
 * wheel until it is clear of everyone before them, so no two look alike.
 */
export function writerColors(people) {
  const taken = [];
  const colors = new Map();
  for (const p of people || []) {
    if (!p.name) continue;
    let hue = hueOf(p.byId || p.name);
    for (let step = 0; step < 12 && taken.some((h) => apart(h, hue) < MIN_APART); step += 1) hue = (hue + 137) % 360;
    taken.push(hue);
    colors.set(p.key, `hsl(${hue} 72% 52%)`);
  }
  return colors;
}
