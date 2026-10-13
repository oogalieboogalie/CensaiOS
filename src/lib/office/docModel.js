// Censai Docs model: a document is an ordered list of blocks. The order is
// the `officeDoc` window field; each block is a part (see officeParts.js).
// Inline marks use the markdown everyone knows: **bold**, *italic*,
// `code` and [links](https://…). Pure, no React.
//
//   block  { type, text, at }      type: p h1 h2 h3 bullet number quote code
//          { type: 'table', rows: [['', …], …] }
//          { type: 'image', src: 'data:…', w, h, alt }
//          { type: 'divider' }
import { PART, newPartId, orderedIds, partKey, readParts } from './officeParts.js';

export const TEXT_TYPES = Object.freeze(['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'quote', 'code']);
export const BLOCK_LABELS = Object.freeze({
  p: 'Text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'Bulleted list', number: 'Numbered list', quote: 'Quote', code: 'Code',
});

export function makeBlock(type = 'p', fields = {}) {
  const base = { type, at: Date.now() };
  if (type === 'table') return { ...base, rows: [['', '', ''], ['', '', ''], ['', '', '']], ...fields };
  if (type === 'image' || type === 'divider') return { ...base, ...fields };
  return { ...base, text: '', ...fields };
}

/** { order, blocks } for rendering, with orphans recovered. */
export function readDoc(win) {
  const blocks = readParts(win, PART.block);
  return { order: orderedIds(win?.officeDoc?.order, blocks), blocks };
}

export function blockKey(id) {
  return partKey(PART.block, id);
}

/** Patch inserting new blocks after `afterId` (or at the end). */
export function insertBlocksPatch(order, afterId, newBlocks) {
  const ids = newBlocks.map(() => newPartId('b'));
  const at = afterId ? order.indexOf(afterId) + 1 : order.length;
  const nextOrder = [...order.slice(0, at), ...ids, ...order.slice(at)];
  const patch = { officeDoc: { order: nextOrder } };
  ids.forEach((id, i) => { patch[blockKey(id)] = newBlocks[i]; });
  return { patch, ids };
}

export function removeBlockPatch(order, id) {
  return { officeDoc: { order: order.filter((x) => x !== id) }, [blockKey(id)]: null };
}

export function moveBlockPatch(order, id, delta) {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return null;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return { officeDoc: { order: next } };
}

/** A whole document from a list of blocks (replacing what was there). */
export function docPatchFromBlocks(win, blocks) {
  const patch = {};
  for (const id of Object.keys(readParts(win, PART.block))) patch[blockKey(id)] = null;
  const now = Date.now();
  const ids = blocks.map((b, i) => {
    const id = newPartId('b');
    patch[blockKey(id)] = { ...b, at: now + i };
    return id;
  });
  patch.officeDoc = { order: ids };
  return patch;
}

const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g;

/** "a **b** c" -> [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }] */
export function parseInline(text) {
  const runs = [];
  const src = String(text || '');
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index > last) runs.push({ text: src.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) runs.push({ text: m[3], italic: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], code: true });
    else runs.push({ text: m[5], link: m[6] });
    last = m.index + m[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  return runs;
}

export function plainText(text) {
  return parseInline(text).map((r) => r.text).join('');
}

/** Consecutive numbered blocks count 1, 2, 3; anything else restarts. */
export function listNumbers(order, blocks) {
  const out = {};
  let n = 0;
  for (const id of order) {
    if (blocks[id]?.type === 'number') { n += 1; out[id] = n; } else n = 0;
  }
  return out;
}
