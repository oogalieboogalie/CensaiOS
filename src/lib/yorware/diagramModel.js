// How a YorWare Diagrams window lives in board state. Every shape, arrow and
// bit of text is its own window field, so two people drawing on one diagram
// merge instead of overwriting each other. A shape carries Excalidraw's own
// `version` and `versionNonce`; when two copies of a shape meet, the higher
// version wins (ties go to the lower nonce, the same rule Excalidraw's own
// collaboration uses). A removed shape stays on the board marked
// `isDeleted: true`, so a late copy from someone else can't bring it back.
//
//   de.<elementId>   one Excalidraw element (shape, arrow, text, picture)
//   dfl.<fileId>     a picture's bytes { id, mimeType, dataURL, created }
//   dgBg             the background colour
import { readParts } from '../office/officeParts.js';

export const DIAGRAM_PART = Object.freeze({ element: 'de', file: 'dfl' });
// The board is downloaded by everyone on it, so keep diagrams and pictures modest.
export const MAX_ELEMENTS = 4000;
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

export const elementKey = (id) => `${DIAGRAM_PART.element}.${id}`;
export const fileKey = (id) => `${DIAGRAM_PART.file}.${id}`;

// Ids become part of a field name, so no dots or anything odd.
export const safeId = (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);

const byIndex = (a, b) => {
  const ai = a.index ?? '';
  const bi = b.index ?? '';
  if (ai !== bi) return ai < bi ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** True when `a` should replace `b` (b may be missing). */
export function isNewer(a, b) {
  if (!a) return false;
  if (!b) return true;
  const av = Number(a.version) || 0;
  const bv = Number(b.version) || 0;
  if (av !== bv) return av > bv;
  return (Number(a.versionNonce) || 0) < (Number(b.versionNonce) || 0);
}

export const sameVersion = (a, b) => Boolean(a && b && a.version === b.version && a.versionNonce === b.versionNonce);

/** Everything the window needs, read from the window record. */
export function readDiagram(win) {
  const elements = Object.values(readParts(win, DIAGRAM_PART.element))
    .filter((el) => el && typeof el === 'object' && safeId(el.id) && typeof el.type === 'string')
    .sort(byIndex);
  const files = {};
  for (const [id, f] of Object.entries(readParts(win, DIAGRAM_PART.file))) {
    if (f && typeof f.dataURL === 'string' && safeId(id)) files[id] = { ...f, id };
  }
  return { elements, files, background: typeof win?.dgBg === 'string' ? win.dgBg : null };
}

/** Shapes you can see (tombstones left out). */
export const liveElements = (elements) => (elements || []).filter((el) => !el.isDeleted);

/** Merge what this screen has with what the board has, shape by shape. */
export function reconcile(local, board) {
  const byId = new Map();
  for (const el of local || []) byId.set(el.id, el);
  for (const el of board || []) {
    if (isNewer(el, byId.get(el.id))) byId.set(el.id, el);
  }
  return [...byId.values()].sort(byIndex);
}

/** True when the board holds a shape this screen hasn't caught up with. */
export function boardIsAhead(local, board) {
  const byId = new Map((local || []).map((el) => [el.id, el]));
  return (board || []).some((el) => isNewer(el, byId.get(el.id)));
}

// A removed shape keeps its fields (Excalidraw still walks deleted shapes
// for arrows and ordering); only `isDeleted` marks it gone.
function tombstone(el) {
  return { ...JSON.parse(JSON.stringify(el)), isDeleted: true };
}

function plain(el) {
  return JSON.parse(JSON.stringify(el));
}

/**
 * The patch that saves what changed on this screen. `known` maps id ->
 * { version, versionNonce } of what the board (or our last write) already
 * holds; it is updated in place so the same change is never sent twice.
 */
export function elementsPatch(elements, known) {
  const patch = {};
  let count = 0;
  for (const el of elements || []) {
    if (!el || !safeId(el.id)) continue;
    const seen = known.get(el.id);
    if (seen && (sameVersion(el, seen) || isNewer(seen, el))) continue;
    patch[elementKey(el.id)] = plain(el);
    known.set(el.id, { version: el.version, versionNonce: el.versionNonce });
    count += 1;
  }
  return { patch, count };
}

/** Remember what the board holds, so it isn't written back. */
export function rememberBoard(known, boardElements) {
  for (const el of boardElements || []) {
    const seen = known.get(el.id);
    if (!seen || isNewer(el, seen)) known.set(el.id, { version: el.version, versionNonce: el.versionNonce });
  }
}

/** The patch that saves new pictures; ones over the size cap are listed in `tooBig`. */
export function filesPatch(files, boardFiles) {
  const patch = {};
  const tooBig = [];
  for (const [id, f] of Object.entries(files || {})) {
    if (!safeId(id) || boardFiles[id] || !f?.dataURL) continue;
    if (f.dataURL.length > MAX_PICTURE_BYTES * 1.37) { tooBig.push(id); continue; }
    patch[fileKey(id)] = { id, mimeType: f.mimeType || 'image/png', dataURL: f.dataURL, created: f.created || Date.now() };
  }
  return { patch, tooBig };
}

/**
 * The patch that replaces the drawing with a scene read from a file. Shapes
 * already on the board become tombstones one version up (never a bare
 * removal: someone else's screen would keep its copy), and the new shapes
 * start above any version the board has seen, so every screen takes them.
 */
export function scenePatch(win, { elements = [], files = {}, background = null }) {
  const live = liveElements(elements).filter((el) => safeId(el.id));
  if (live.length > MAX_ELEMENTS) throw new Error(`That drawing has ${live.length} shapes. A board diagram holds up to ${MAX_ELEMENTS}.`);
  const old = new Map(readDiagram(win).elements.map((el) => [el.id, el]));
  const patch = {};
  const nonce = () => Math.floor(Math.random() * 2 ** 31);
  for (const el of old.values()) {
    if (!el.isDeleted) patch[elementKey(el.id)] = tombstone({ ...el, version: (Number(el.version) || 0) + 1, versionNonce: nonce() });
  }
  for (const el of live) {
    const before = Number(old.get(el.id)?.version) || 0;
    patch[elementKey(el.id)] = plain({ ...el, version: Math.max(Number(el.version) || 1, before + 2), versionNonce: nonce() });
  }
  for (const [key, value] of Object.entries(win || {})) {
    if (value !== null && key.startsWith(`${DIAGRAM_PART.file}.`)) patch[key] = null;
  }
  Object.assign(patch, filesPatch(files, {}).patch);
  if (background) patch.dgBg = background;
  return patch;
}

/** A new, empty diagram window. */
export function makeDiagram() {
  return {};
}
