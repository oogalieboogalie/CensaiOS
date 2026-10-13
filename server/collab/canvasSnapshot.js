// server/collab/canvasSnapshot.js
//
// The canvas (windows, groups, ink, links, dock) lives only in the workspace's
// Yjs document. The older whole-workspace snapshot row keeps two jobs:
//
//   1. A backup copy written FROM the Yjs doc (writeCanvasBackup), for search,
//      exports and older tools. It is never read back as the board.
//   2. A door IN for writers that still send a whole snapshot (the commands
//      API, a recovery-copy restore): mirrorSnapshotToCanvas applies only what
//      they changed to the Yjs doc, so live boards see it and nothing else is
//      overwritten.

import * as Y from 'yjs';
import { mergeWorkspaceState } from '../state/clientStateStore.js';
import { writeStateToDoc } from '../../src/lib/collaboration/yCanvasSync.js';
import { transactCanvasDoc } from './liveDoc.js';
import { docToSnapshot } from './seedFromSnapshot.js';
import { CANVAS_ROOT } from './ySchema.js';

export const CANVAS_SNAPSHOT_FIELDS = Object.freeze(['wins', 'canvasGroups', 'paths', 'links', 'dock']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The canvas fields actually present on a snapshot value. */
export function pickCanvasFields(value) {
  const out = {};
  if (!isObject(value)) return out;
  for (const key of CANVAS_SNAPSHOT_FIELDS) if (key in value) out[key] = value[key];
  return out;
}

/** A snapshot value with the canvas fields removed (per-person settings only). */
export function withoutCanvasFields(value) {
  if (!isObject(value)) return {};
  const out = { ...value };
  for (const key of CANVAS_SNAPSHOT_FIELDS) delete out[key];
  return out;
}

/** Canvas fields read from the doc, or null for a doc that never held a canvas. */
export function canvasBackupFromDoc(doc) {
  if (!(doc instanceof Y.Doc) || !(doc.getMap(CANVAS_ROOT).get('windows') instanceof Y.Map)) return null;
  const snapshot = docToSnapshot(doc);
  return {
    wins: snapshot.wins,
    canvasGroups: snapshot.canvasGroups,
    paths: snapshot.paths,
    links: snapshot.links,
    dock: snapshot.dock,
  };
}

/** Refresh the snapshot row's canvas fields from the doc (no revision bump). */
export async function writeCanvasBackup(db, workspaceId, doc) {
  const patch = canvasBackupFromDoc(doc);
  if (!patch) return false;
  await mergeWorkspaceState({ db, workspaceId, patch, bump: false });
  return true;
}

/**
 * Apply what a whole-snapshot write changed (previous -> next) to the live
 * Yjs doc. Fields the writer left out, and windows it did not touch, are not
 * written, so a stale snapshot cannot rewind other people's edits to them.
 */
export async function mirrorSnapshotToCanvas(workspaceId, previousValue, nextValue, options = {}) {
  const transact = options.transact ?? transactCanvasDoc;
  const next = pickCanvasFields(nextValue);
  const keys = Object.keys(next);
  if (!keys.length) return false;
  const before = pickCanvasFields(previousValue);
  try {
    return await transact(workspaceId, (doc) => {
      // A field the old snapshot never had diffs against the doc itself, so
      // ink and links are not appended twice.
      const current = docToSnapshot(doc);
      const prev = {};
      for (const key of keys) prev[key] = key in before ? before[key] : current[key];
      writeStateToDoc(doc, prev, next, 'snapshot-mirror');
    });
  } catch {
    return false;
  }
}
