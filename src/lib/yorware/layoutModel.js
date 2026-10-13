// How a YorWare Layout window lives in board state. Like YorWare PDF and
// Censai Office, every piece is its own window field, so two people working
// on one flyer merge instead of overwriting each other. A removed piece is set
// to null (undefined is skipped by the sync).
//
//   layDoc       { size, w, h, margin, order: [pageId…] }   the document
//   lpg.<id>     { at, noMaster }                             one page
//   lfr.<id>     { page, type, x, y, w, h, z, … }             a frame on a page
//                (page is a page id or "master": shown on every page)
//   lst.<id>     { text, font, bold, size, lead, color, align, frames: [frameId…] }
//                a story: text that flows through its frames in order
//   lim.<id>     { name, data, mime, w, h, bytes }            a picture (base64)
//
// Positions are PDF points (1/72 inch) from the page's top-left corner.
import { newPartId, orderedIds, readParts } from '../office/officeParts.js';

export const LAYOUT_PART = Object.freeze({ page: 'lpg', frame: 'lfr', story: 'lst', image: 'lim' });
export const MASTER = 'master';
export const FRAME_TYPES = Object.freeze(['text', 'image', 'rect', 'ellipse', 'line']);
// Pictures live on the board, which every teammate downloads.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const PAGE_SIZES = Object.freeze({
  letter: { label: 'Letter', w: 612, h: 792 },
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  a5: { label: 'A5', w: 419.53, h: 595.28 },
  tabloid: { label: 'Tabloid', w: 792, h: 1224 },
  square: { label: 'Square', w: 576, h: 576 },
});

export const pageKey = (id) => `${LAYOUT_PART.page}.${id}`;
export const frameKey = (id) => `${LAYOUT_PART.frame}.${id}`;
export const storyKey = (id) => `${LAYOUT_PART.story}.${id}`;
export const imageKey = (id) => `${LAYOUT_PART.image}.${id}`;

export function makeLayoutDoc(size = 'letter') {
  const s = PAGE_SIZES[size] || PAGE_SIZES.letter;
  return { layDoc: { size, w: s.w, h: s.h, margin: 36, order: [] } };
}

/** Everything the window needs, read from the window record. */
export function readLayout(win) {
  const meta = win?.layDoc || {};
  const pages = readParts(win, LAYOUT_PART.page);
  const stories = readParts(win, LAYOUT_PART.story);
  const images = readParts(win, LAYOUT_PART.image);
  const frames = {};
  for (const [id, f] of Object.entries(readParts(win, LAYOUT_PART.frame))) {
    if (f.page === MASTER || pages[f.page]) frames[id] = f;
  }
  const order = orderedIds(meta.order, pages);
  const byPage = {};
  for (const [id, f] of Object.entries(frames).sort((a, b) => (a[1].z || 0) - (b[1].z || 0))) (byPage[f.page] ||= []).push(id);
  // Each story's chain: its own frame list, then any frame that points at it
  // but the list lost (two people linking at once), oldest first.
  const chains = {};
  for (const [sid, s] of Object.entries(stories)) {
    const listed = (s.frames || []).filter((fid) => frames[fid]?.story === sid);
    const strays = Object.keys(frames).filter((fid) => frames[fid].story === sid && !listed.includes(fid))
      .sort((a, b) => (frames[a].z || 0) - (frames[b].z || 0));
    chains[sid] = [...new Set([...listed, ...strays])];
  }
  return {
    size: meta.size || 'letter', w: Number(meta.w) || 612, h: Number(meta.h) || 792, margin: Number(meta.margin ?? 36),
    order, pages, frames, stories, images, byPage, chains,
  };
}

const metaOf = (doc, extra = {}) => ({ layDoc: { size: doc.size, w: doc.w, h: doc.h, margin: doc.margin, order: doc.order, ...extra } });
const topZ = (doc) => Math.max(0, ...Object.values(doc.frames).map((f) => f.z || 0)) + 1;

export function pageSizePatch(doc, size) {
  const s = PAGE_SIZES[size];
  return s ? metaOf(doc, { size, w: s.w, h: s.h }) : {};
}

/** Add a page after `afterId` (or at the end). */
export function addPagePatch(doc, afterId, now = Date.now()) {
  const id = newPartId('pg');
  const order = [...doc.order];
  const at = afterId && order.includes(afterId) ? order.indexOf(afterId) + 1 : order.length;
  order.splice(at, 0, id);
  return { id, patch: { ...metaOf(doc, { order }), [pageKey(id)]: { at: now, noMaster: false } } };
}

export function movePagePatch(doc, id, toIndex) {
  const order = doc.order.filter((p) => p !== id);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, id);
  return metaOf(doc, { order });
}

/** Remove a page, its frames, and stories and pictures nothing uses any more. */
export function removePagePatch(doc, id) {
  const patch = { ...metaOf(doc, { order: doc.order.filter((p) => p !== id) }), [pageKey(id)]: null };
  const gone = (doc.byPage[id] || []);
  return { ...patch, ...removeFramesPatch(doc, gone) };
}

export function setPagePatch(doc, id, fields) {
  return { [pageKey(id)]: { ...doc.pages[id], ...fields } };
}

/** Add a frame. Text frames get a new story unless `story` is given. */
export function addFramePatch(doc, fields, storyFields = {}) {
  const id = newPartId('fr');
  const frame = { ...fields, z: topZ(doc) };
  const patch = {};
  if (frame.type === 'text' && !frame.story) {
    const sid = newPartId('st');
    frame.story = sid;
    patch[storyKey(sid)] = { text: '', font: 'sans', bold: false, size: 14, lead: 1.3, color: '#111111', align: 'left', ...storyFields, frames: [id] };
  } else if (frame.type === 'text') {
    const s = doc.stories[frame.story];
    patch[storyKey(frame.story)] = { ...s, frames: [...(doc.chains[frame.story] || []), id] };
  }
  patch[frameKey(id)] = frame;
  return { id, patch };
}

export function framePatch(id, frame) {
  return { [frameKey(id)]: frame };
}

export function storyPatch(doc, sid, fields) {
  return { [storyKey(sid)]: { ...doc.stories[sid], ...fields } };
}

/** Remove frames. A story's text stays with its other frames; an orphan story and unused pictures go. */
export function removeFramesPatch(doc, ids) {
  const gone = new Set(ids);
  const patch = {};
  for (const id of gone) patch[frameKey(id)] = null;
  for (const [sid, chain] of Object.entries(doc.chains)) {
    if (!chain.some((fid) => gone.has(fid))) continue;
    const left = chain.filter((fid) => !gone.has(fid));
    patch[storyKey(sid)] = left.length ? { ...doc.stories[sid], frames: left } : null;
  }
  const used = new Set(Object.entries(doc.frames).filter(([fid]) => !gone.has(fid)).map(([, f]) => f.img).filter(Boolean));
  for (const iid of Object.keys(doc.images)) if (!used.has(iid)) patch[imageKey(iid)] = null;
  return patch;
}

/** Send `targetId`'s text frame into `sid`'s chain, after its last frame. Its own text joins the end. */
export function linkFramePatch(doc, sid, targetId) {
  const target = doc.frames[targetId];
  if (!target || target.type !== 'text' || target.story === sid || !doc.stories[sid]) return {};
  const old = target.story;
  const s = doc.stories[sid];
  const oldText = (doc.stories[old]?.text || '').trim();
  const patch = {
    [frameKey(targetId)]: { ...target, story: sid },
    [storyKey(sid)]: { ...s, text: oldText ? `${s.text}\n${oldText}` : s.text, frames: [...doc.chains[sid], targetId] },
  };
  const rest = (doc.chains[old] || []).filter((fid) => fid !== targetId);
  patch[storyKey(old)] = rest.length ? { ...doc.stories[old], frames: rest } : null;
  return patch;
}

/** Take a frame out of its chain into a story of its own, styled the same and empty. */
export function unlinkFramePatch(doc, id) {
  const f = doc.frames[id];
  const chain = f ? doc.chains[f.story] || [] : [];
  if (chain.length < 2) return {};
  const sid = newPartId('st');
  const { frames: _drop, ...style } = doc.stories[f.story];
  return {
    [storyKey(f.story)]: { ...doc.stories[f.story], frames: chain.filter((fid) => fid !== id) },
    [storyKey(sid)]: { ...style, text: '', frames: [id] },
    [frameKey(id)]: { ...f, story: sid },
  };
}

export function addImagePatch({ name, data, mime, w, h, bytes }) {
  const id = newPartId('im');
  return { id, patch: { [imageKey(id)]: { name: String(name || 'Picture'), data, mime, w, h, bytes: bytes || 0 } } };
}

/** Bring frames to the front, or send them to the back. */
export function restackPatch(doc, ids, front = true) {
  const zs = Object.values(doc.frames).map((f) => f.z || 0);
  let z = front ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - ids.length;
  const patch = {};
  for (const id of ids) patch[frameKey(id)] = { ...doc.frames[id], z: z++ };
  return patch;
}

/** Copies of frames, nudged. Text copies get their own copy of the text. */
export function duplicateFramesPatch(doc, ids, offset = 12) {
  let patch = {};
  const ids2 = [];
  let working = doc;
  for (const id of ids) {
    const f = doc.frames[id];
    if (!f) continue;
    const { story, z: _z, ...rest } = f;
    const copy = { ...rest, x: f.x + offset, y: f.y + offset };
    const s = story ? doc.stories[story] : null;
    const { frames: _f, ...style } = s || {};
    const added = addFramePatch(working, copy, s ? style : {});
    ids2.push(added.id);
    patch = { ...patch, ...added.patch };
    working = { ...working, frames: { ...working.frames, [added.id]: { ...copy, z: topZ(working) } } };
  }
  return { ids: ids2, patch };
}

/** Keep a box on the page (at least partly) and at least 6 points big. */
export function clampFrame(box, doc) {
  const w = Math.max(6, box.w);
  const h = Math.max(box.type === 'line' ? 0 : 6, box.h);
  return { ...box, w, h, x: Math.max(-w + 12, Math.min(box.x, doc.w - 12)), y: Math.max(-h + 12, Math.min(box.y, doc.h - 12)) };
}
