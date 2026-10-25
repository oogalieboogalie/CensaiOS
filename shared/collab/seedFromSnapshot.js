// server/collab/seedFromSnapshot.js
//
// Phase 2: pure snapshot <-> Y.Doc converters. NO I/O IN THIS FILE.
//
// A revision snapshot is the legacy whole-canvas shape produced by
// canvasWorkspaceSnapshot(): { wins, canvasGroups, paths, links, dock, ... }.
// The seeder maps exactly the SYNC subset from the brief onto the Phase-1
// registry (CANVAS_ROOT + CANVAS_KEYS + SCHEMA_VERSION + validators):
// windows, groups, paths, links, dock, meta. Everything else in the snapshot
// (workspaceId, currentProject, pan/zoom/selection, drafts, ...) stays
// local/legacy and is never seeded.
//
// Entries without a registry-valid id cannot key their Y.Map and are
// skipped; windows failing isValidWindowGeometry are skipped too. The legacy
// snapshot row is left untouched, so a bad seed never destroys data.
//
// Y.Text bodies are Phase 3's job (created lazily on open per the brief);
// the seeder keeps seed-time strings as plain fields. docToSnapshot still
// reads Y.Text values back as strings, so round-trips stay stable after
// Phase 3 starts writing them.

import * as Y from 'yjs';
import {
  CANVAS_KEYS,
  CANVAS_ROOT,
  SCHEMA_VERSION,
  isValidId,
  isValidWindowGeometry,
} from './ySchema.js';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeScalar(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  return undefined;
}

/** Plain JSON-ish value -> Yjs shared value (primitives pass through). */
export function valueToY(value) {
  if (value instanceof Y.Map || value instanceof Y.Array || value instanceof Y.Text) return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    const arr = new Y.Array();
    arr.push(value.map((item) => (item === undefined ? null : valueToY(item))));
    return arr;
  }
  if (value instanceof Date) return value.toISOString();
  if (isPlainObject(value)) {
    const map = new Y.Map();
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || typeof entry === 'function') continue;
      map.set(key, valueToY(entry));
    }
    return map;
  }
  const scalar = sanitizeScalar(value);
  if (scalar !== undefined) return scalar;
  try {
    return valueToY(JSON.parse(JSON.stringify(value)));
  } catch {
    return String(value);
  }
}

/** Yjs shared value -> plain JSON-ish value. */
export function valueFromY(value) {
  if (value instanceof Y.Map) {
    const out = {};
    for (const [key, entry] of value.entries()) out[key] = valueFromY(entry);
    return out;
  }
  if (value instanceof Y.Array) return value.toArray().map(valueFromY);
  if (value instanceof Y.Text) return value.toString();
  return value;
}

function windowsToY(wins) {
  const map = new Y.Map();
  const list = Array.isArray(wins) ? wins : [];
  for (const win of list) {
    if (!isPlainObject(win) || !isValidId(win.id)) continue;
    const { id, x, y, w, h } = win;
    if (!isValidWindowGeometry({ id, x, y, w, h })) continue;
    map.set(String(win.id), valueToY(win));
  }
  return map;
}

function groupsToY(canvasGroups) {
  const map = new Y.Map();
  const list = Array.isArray(canvasGroups) ? canvasGroups : [];
  list.forEach((group, index) => {
    if (!isPlainObject(group)) return;
    const key = isValidId(group.id) ? String(group.id) : `group-${index}`;
    map.set(key, valueToY(group));
  });
  return map;
}

function listToY(list) {
  const arr = new Y.Array();
  const items = Array.isArray(list) ? list : [];
  if (items.length > 0) arr.push(items.map((item) => valueToY(item)));
  return arr;
}

/**
 * Legacy snapshot -> fresh Y.Doc under the Phase-1 root. Pure: builds and
 * returns the doc without touching disk, network, or the passed snapshot.
 */
export function snapshotToDoc(snapshot = {}, options = {}) {
  const source = isPlainObject(snapshot) ? snapshot : {};
  const doc = new Y.Doc();
  doc.transact(() => {
    const root = doc.getMap(CANVAS_ROOT);
    root.set('windows', windowsToY(source.wins));
    root.set('groups', groupsToY(source.canvasGroups));
    root.set('paths', listToY(source.paths));
    root.set('links', listToY(source.links));
    root.set('dock', valueToY(isPlainObject(source.dock) ? source.dock : {}));
    const meta = new Y.Map();
    meta.set('schemaVersion', SCHEMA_VERSION);
    meta.set('seededFrom', options.seededFrom ?? source.revision ?? 'snapshot');
    meta.set('updatedAt', options.updatedAt ?? new Date().toISOString());
    root.set('meta', meta);
  });
  return doc;
}

/** Y.Doc -> legacy-shaped snapshot subset ({ wins, canvasGroups, paths, links, dock, meta }). */
export function docToSnapshot(doc) {
  const fallback = { wins: [], canvasGroups: [], paths: [], links: [], dock: {}, meta: {} };
  if (!(doc instanceof Y.Doc)) return fallback;
  const root = doc.getMap(CANVAS_ROOT);
  const typed = (key) => {
    const value = root.get(key);
    if (CANVAS_KEYS[key] === 'Y.Map') return value instanceof Y.Map ? value : null;
    if (CANVAS_KEYS[key] === 'Y.Array') return value instanceof Y.Array ? value : null;
    return null;
  };
  const windows = typed('windows');
  const groups = typed('groups');
  const paths = typed('paths');
  const links = typed('links');
  const dock = typed('dock');
  const meta = typed('meta');
  return {
    wins: windows ? [...windows.values()].map(valueFromY) : [],
    canvasGroups: groups ? [...groups.values()].map(valueFromY) : [],
    paths: paths ? paths.toArray().map(valueFromY) : [],
    links: links ? links.toArray().map(valueFromY) : [],
    dock: dock ? valueFromY(dock) : {},
    meta: meta ? valueFromY(meta) : {},
  };
}
