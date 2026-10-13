// How Censai Office files live in board state. Each piece (a sheet cell, a
// doc block, a slide) is its own window field, e.g. `oc.s1.B4`, so the
// per-field CRDT sync merges two people editing different cells, blocks or
// slides at the same moment instead of one overwriting the other. A removed
// piece is set to null (undefined is skipped by the sync).
//
//   oc.<sheetId>.<A1>  sheet cell   { v, s? }
//   ob.<blockId>       doc block    { type, text, … , at }
//   os.<slideId>       slide        { blocks, notes, at }

export const PART = Object.freeze({ cell: 'oc', block: 'ob', slide: 'os' });

let seq = 0;
/** Short ids with no dots, unique enough for one board. */
export function newPartId(prefix = 'p') {
  seq = (seq + 1) % 1296;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

export function partKey(kind, ...ids) {
  return [kind, ...ids].join('.');
}

/** Every live part of one kind: { 'rest.of.key': value }. */
export function readParts(win, kind) {
  const prefix = `${kind}.`;
  const out = {};
  for (const [key, value] of Object.entries(win || {})) {
    if (value !== null && value !== undefined && key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}

/**
 * The display order: the shared order list, minus removed parts, plus any
 * part someone added at the same moment that the order list lost (oldest
 * first), so a concurrent insert never disappears.
 */
export function orderedIds(order, parts) {
  const seen = new Set();
  const out = [];
  for (const id of order || []) {
    if (parts[id] && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  const strays = Object.keys(parts).filter((id) => !seen.has(id))
    .sort((a, b) => (parts[a].at || 0) - (parts[b].at || 0));
  return [...out, ...strays];
}

/** A patch that removes every part of a kind (used when replacing a file). */
export function clearParts(win, kind) {
  const prefix = `${kind}.`;
  const patch = {};
  for (const [key, value] of Object.entries(win || {})) {
    if (value !== null && key.startsWith(prefix)) patch[key] = null;
  }
  return patch;
}
