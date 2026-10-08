// Two-way mapping between the Zustand canvas state and the shared Yjs (CRDT)
// document served by Hocuspocus. Pure: no sockets, no React.
//
// Granularity is what makes concurrent edits merge instead of clobbering:
// windows and groups are Y.Maps keyed by id with one Y entry per field, so
// "A moves window 1 while B resizes window 2" (or even the same window's
// different fields) both survive. Two writes to the SAME field resolve
// deterministically on every client by Yjs's client-id ordering, i.e. last
// writer wins per property. Ink paths/links are arrays: appends merge,
// anything else replaces the list.
//
// Window body text (doc `text`, code editor `code`) lives in a Y.Text, so two
// people typing in the same window merge character by character. Fields in
// LOCAL_WINDOW_FIELDS (like whether *I* have the editor open) never sync.
import * as Y from 'yjs';
import { WINDOW_TEXT_FIELDS, applyTextDiff, diffText } from '../../../server/collab/textDiff.js';
import { valueFromY, valueToY } from '../../../server/collab/seedFromSnapshot.js';
import { CANVAS_ROOT, SCHEMA_VERSION, isValidId, isValidWindowGeometry } from '../../../server/collab/ySchema.js';

export const SYNCED_KEYS = ['wins', 'canvasGroups', 'paths', 'links', 'dock'];
export const LOCAL_WINDOW_FIELDS = new Set(['isEditing']);
const EMPTY = Object.freeze({ wins: [], canvasGroups: [], paths: [], links: [], dock: {} });

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function rootMap(root, key, Ctor) {
  let value = root.get(key);
  if (!(value instanceof Ctor)) {
    value = new Ctor();
    root.set(key, value);
  }
  return value;
}

function syncableWindow(win) {
  return win && isValidWindowGeometry({ id: win.id, x: win.x, y: win.y, w: win.w, h: win.h });
}

function groupKey(group, index) {
  return isValidId(group?.id) ? String(group.id) : `group-${index}`;
}

// Write only the fields that changed between prev and next entry.
function writeEntry(map, key, prevEntry, nextEntry, isWindow = false) {
  let target = map.get(key);
  if (!(target instanceof Y.Map)) {
    target = new Y.Map();
    map.set(key, target);
    prevEntry = null;
  }
  writeFields(target, prevEntry, nextEntry, isWindow);
}

function writeFields(target, prevEntry, nextEntry, isWindow = false) {
  for (const [field, value] of Object.entries(nextEntry)) {
    if (value === undefined || typeof value === 'function') continue;
    if (isWindow && LOCAL_WINDOW_FIELDS.has(field)) continue;
    if (prevEntry && same(prevEntry[field], value)) continue;
    if (isWindow && WINDOW_TEXT_FIELDS.has(field) && typeof value === 'string') writeText(target, field, value);
    else target.set(field, valueToY(value));
  }
  for (const field of Object.keys(prevEntry || {})) {
    if (!(field in nextEntry) && !(isWindow && LOCAL_WINDOW_FIELDS.has(field))) target.delete(field);
  }
}

// Diff against the shared text itself so only the typed span changes.
function writeText(target, field, value) {
  const current = target.get(field);
  if (current instanceof Y.Text) {
    applyTextDiff(current, diffText(current.toString(), value));
    return;
  }
  target.set(field, new Y.Text(value));
}

function syncKeyed(map, prevList, nextList, keyOf, accept, isWindow = false) {
  const prev = new Map();
  (prevList || []).forEach((entry, i) => { if (accept(entry)) prev.set(keyOf(entry, i), entry); });
  const seen = new Set();
  (nextList || []).forEach((entry, i) => {
    if (!accept(entry)) return;
    const key = keyOf(entry, i);
    seen.add(key);
    const before = prev.get(key);
    if (before === entry) return;
    writeEntry(map, key, before, entry, isWindow);
  });
  for (const key of prev.keys()) if (!seen.has(key)) map.delete(key);
}

function syncList(arr, prevList, nextList) {
  const prev = prevList || [];
  const next = nextList || [];
  if (prev === next) return;
  const appendOnly = next.length >= prev.length && prev.every((item, i) => same(item, next[i]));
  if (appendOnly) {
    if (next.length > prev.length) arr.push(next.slice(prev.length).map((item) => valueToY(item)));
    return;
  }
  if (syncById(arr, prev, next)) return;
  arr.delete(0, arr.length);
  if (next.length) arr.push(next.map((item) => valueToY(item)));
}

// Erasing or editing strokes touches only those ids, so a stroke someone
// else adds at the same moment survives the merge. False when the lists
// aren't keyed by unique ids (fall back to replacing the list).
function syncById(arr, prev, next) {
  const ids = (list) => list.map((item) => (isValidId(item?.id) ? String(item.id) : null));
  const prevIds = ids(prev);
  const nextIds = ids(next);
  if (prevIds.includes(null) || nextIds.includes(null)) return false;
  if (new Set(prevIds).size !== prevIds.length || new Set(nextIds).size !== nextIds.length) return false;
  const prevById = new Map(prev.map((item, i) => [prevIds[i], item]));
  const nextById = new Map(next.map((item, i) => [nextIds[i], item]));
  const kept = prevIds.filter((id) => nextById.has(id));
  const keptInNext = nextIds.filter((id) => prevById.has(id));
  if (kept.some((id, i) => keptInNext[i] !== id)) return false; // reordered
  const docIds = arr.toArray().map((value) => String(valueFromY(value)?.id ?? ''));
  for (let i = docIds.length - 1; i >= 0; i -= 1) {
    const id = docIds[i];
    if (prevById.has(id) && (!nextById.has(id) || !same(prevById.get(id), nextById.get(id)))) {
      arr.delete(i, 1);
      if (nextById.has(id)) arr.insert(i, [valueToY(nextById.get(id))]);
    }
  }
  const added = next.filter((item, i) => !prevById.has(nextIds[i]));
  if (added.length) arr.push(added.map((item) => valueToY(item)));
  return true;
}

/** Push the local change prev -> next into the doc as one transaction. */
export function writeStateToDoc(doc, prevState, nextState, origin) {
  const prev = prevState || EMPTY;
  const next = nextState || EMPTY;
  doc.transact(() => {
    const root = doc.getMap(CANVAS_ROOT);
    if (prev.wins !== next.wins) {
      syncKeyed(rootMap(root, 'windows', Y.Map), prev.wins, next.wins, (w) => String(w.id), syncableWindow, true);
    }
    if (prev.canvasGroups !== next.canvasGroups) {
      syncKeyed(rootMap(root, 'groups', Y.Map), prev.canvasGroups, next.canvasGroups, groupKey, (g) => g && typeof g === 'object');
    }
    if (prev.paths !== next.paths) syncList(rootMap(root, 'paths', Y.Array), prev.paths, next.paths);
    if (prev.links !== next.links) syncList(rootMap(root, 'links', Y.Array), prev.links, next.links);
    if (prev.dock !== next.dock && next.dock && typeof next.dock === 'object') {
      writeFields(rootMap(root, 'dock', Y.Map), prev.dock, next.dock);
    }
    const meta = rootMap(root, 'meta', Y.Map);
    if (meta.get('schemaVersion') !== SCHEMA_VERSION) meta.set('schemaVersion', SCHEMA_VERSION);
  }, origin);
}

/** True when the doc has never held a canvas (first client should seed it). */
export function isDocEmpty(doc) {
  return !(doc.getMap(CANVAS_ROOT).get('windows') instanceof Y.Map);
}

/**
 * Doc -> the synced subset of store state. Window order (stacking) stays as
 * the local client had it; windows new to this client go on top.
 */
export function readDocState(doc, currentState = EMPTY) {
  const root = doc.getMap(CANVAS_ROOT);
  const windows = root.get('windows');
  const remote = new Map();
  if (windows instanceof Y.Map) for (const [id, value] of windows.entries()) remote.set(id, valueFromY(value));
  const ordered = [];
  for (const win of currentState.wins || []) {
    const id = String(win?.id);
    if (remote.has(id)) { ordered.push(keepIdentity(win, withLocalFields(remote.get(id), win))); remote.delete(id); }
    else if (!syncableWindow(win)) ordered.push(win);
  }
  for (const win of remote.values()) ordered.push(withLocalFields(win, null));

  const groups = root.get('groups');
  const paths = root.get('paths');
  const links = root.get('links');
  const dock = root.get('dock');
  const wins = ordered.length === (currentState.wins || []).length
    && ordered.every((w, i) => w === currentState.wins[i]) ? currentState.wins : ordered;
  return {
    wins,
    canvasGroups: keepIdentity(currentState.canvasGroups, groups instanceof Y.Map ? [...groups.values()].map(valueFromY) : []),
    paths: keepIdentity(currentState.paths, paths instanceof Y.Array ? paths.toArray().map(valueFromY) : []),
    links: keepIdentity(currentState.links, links instanceof Y.Array ? links.toArray().map(valueFromY) : []),
    dock: dock instanceof Y.Map ? keepIdentity(currentState.dock, valueFromY(dock)) : (currentState.dock || {}),
  };
}

function withLocalFields(remoteWin, localWin) {
  let out = remoteWin;
  for (const field of LOCAL_WINDOW_FIELDS) {
    if (field in out) { out = { ...out }; delete out[field]; }
    if (localWin && field in localWin) out = { ...out, [field]: localWin[field] };
  }
  return out;
}

// Reuse the existing object when nothing changed so React skips re-rendering it.
function keepIdentity(local, remote) {
  return same(local, remote) ? local : remote;
}
