// server/shareLinks/projector.js
//
// View and comment guests never receive the Yjs document: the server reads
// the live canvas doc, filters it per share link (scope, private windows,
// stage) and pushes a plain board picture over the collaboration socket a
// few times a second. Hidden windows therefore never leave the server, and
// a big audience costs one doc observer per board, not one CRDT replica
// per viewer.

import { docToSnapshot } from '../collab/seedFromSnapshot.js';
import { openCanvasDocReader } from '../collab/liveDoc.js';
import { createLogger } from '../logger.js';
import { projectBoardForLink } from './access.js';

const FLUSH_MS = 250;
const log = createLogger('guest-projector');
const projectors = new Map();

let openReader = openCanvasDocReader;
let loadFallback = async () => null;

/** Test seam and boot wiring: where to read boards from. */
export function configureProjector({ reader, fallback } = {}) {
  if (reader) openReader = reader;
  if (fallback) loadFallback = fallback;
}

function linkKey(link) {
  return `${link.id}:${link.stage ? 1 : 0}:${link.scope_kind}:${link.scope_id || ''}`;
}

async function readSnapshot(projector) {
  if (projector.doc) return docToSnapshot(projector.doc);
  return (await loadFallback(projector.workspaceId)) || { wins: [], canvasGroups: [], paths: [], links: [] };
}

async function flush(projector) {
  projector.timer = null;
  if (projector.subscribers.size === 0) return;
  let snapshot;
  try {
    snapshot = await readSnapshot(projector);
  } catch (error) {
    log.warn('board projection failed', { workspaceId: projector.workspaceId, error: error.message });
    return;
  }
  const perLink = new Map();
  for (const subscriber of projector.subscribers.values()) {
    const key = linkKey(subscriber.link);
    if (!perLink.has(key)) {
      const board = projectBoardForLink(snapshot, subscriber.link);
      perLink.set(key, { board, json: JSON.stringify(board) });
    }
    const { board, json } = perLink.get(key);
    if (subscriber.lastJson === json) continue;
    subscriber.lastJson = json;
    try { subscriber.send({ type: 'guest.board', board }); } catch { /* socket closing */ }
  }
}

function schedule(projector, delay = FLUSH_MS) {
  if (projector.timer) return;
  projector.timer = setTimeout(() => { flush(projector); }, delay);
  projector.timer.unref?.();
}

async function ensureProjector(workspaceId) {
  let projector = projectors.get(workspaceId);
  if (projector) {
    await projector.ready;
    return projector;
  }
  projector = { workspaceId, subscribers: new Map(), doc: null, reader: null, timer: null, ready: null };
  projectors.set(workspaceId, projector);
  projector.ready = (async () => {
    try {
      projector.reader = await openReader(workspaceId);
    } catch (error) {
      log.warn('could not open the live board for guests', { workspaceId, error: error.message });
    }
    if (projector.reader?.doc) {
      projector.doc = projector.reader.doc;
      projector.onUpdate = () => schedule(projector);
      projector.doc.on('update', projector.onUpdate);
    }
  })();
  await projector.ready;
  return projector;
}

function closeProjector(projector) {
  clearTimeout(projector.timer);
  if (projector.doc && projector.onUpdate) projector.doc.off('update', projector.onUpdate);
  projectors.delete(projector.workspaceId);
  Promise.resolve(projector.reader?.close?.()).catch(() => undefined);
}

/** Start sending a guest projected boards. Returns an unsubscribe function. */
export async function subscribeProjection({ workspaceId, clientId, link, send }) {
  const projector = await ensureProjector(String(workspaceId));
  projector.subscribers.set(String(clientId), { link, send, lastJson: null });
  await flush(projector);
  return () => {
    const current = projectors.get(String(workspaceId));
    if (!current) return;
    current.subscribers.delete(String(clientId));
    if (current.subscribers.size === 0) closeProjector(current);
  };
}

/** A link changed (stage toggled): re-filter and resend for its viewers. */
export function updateProjectionLink(workspaceId, link) {
  const projector = projectors.get(String(workspaceId));
  if (!projector) return 0;
  let changed = 0;
  for (const subscriber of projector.subscribers.values()) {
    if (String(subscriber.link.id) !== String(link.id)) continue;
    subscriber.link = { ...subscriber.link, ...link };
    changed += 1;
  }
  if (changed) schedule(projector, 0);
  return changed;
}

/** Owner-side writes that don't go through Yjs (public flags) ask for a resend. */
export function refreshProjection(workspaceId) {
  const projector = projectors.get(String(workspaceId));
  if (projector) schedule(projector, 0);
}

/** One-off read for the REST board endpoint. */
export async function readProjectedBoard(workspaceId, link) {
  const live = projectors.get(String(workspaceId));
  if (live) return projectBoardForLink(await readSnapshot(live), link);
  const reader = await openReader(String(workspaceId)).catch(() => null);
  try {
    const snapshot = reader?.doc
      ? docToSnapshot(reader.doc)
      : ((await loadFallback(String(workspaceId))) || { wins: [], canvasGroups: [], paths: [], links: [] });
    return projectBoardForLink(snapshot, link);
  } finally {
    await Promise.resolve(reader?.close?.()).catch(() => undefined);
  }
}

export function __resetProjectorsForTests() {
  for (const projector of projectors.values()) closeProjector(projector);
  projectors.clear();
  openReader = openCanvasDocReader;
  loadFallback = async () => null;
}
