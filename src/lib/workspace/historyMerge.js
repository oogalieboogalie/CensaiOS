/**
 * src/lib/workspace/historyMerge.js
 *
 * Multiplayer-safe undo support for useWorkspaceHistory.
 *
 * Problem: the history stack restores whole snapshots. After a remote
 * commit lands, popping an older entry would resurrect stale remote
 * objects — and the next autosave would 409 against the advanced revision.
 * Same quirk Excalidraw ships with; Figma avoids it with per-user inverse
 * ops, which is a much bigger rewrite than this file.
 *
 * Fix: the history hook stamps every stack entry with a sequence number and
 * records the last adopted remote snapshot (`notifyRemoteHistory`). When an
 * undo/redo target predates that remote snapshot, it is MERGED instead of
 * restored verbatim: objects the remote side touched keep their current
 * version, everything else reverts. Remote wins on shared edits.
 */

// Collections merged per-object by `id` (index fallback for id-less items).
export const HISTORY_COLLECTIONS = Object.freeze(['wins', 'canvasGroups', 'paths', 'links', 'groups']);

// Everything else in the history snapshot reverts wholesale unless the
// remote snapshot changed it.
export const HISTORY_SCALARS = Object.freeze([
  'dockOffset',
  'extraAgents',
  'penColor',
  'penSize',
  'penMode',
  'sidebarFavorites',
]);

export const HISTORY_KEYS = Object.freeze([...HISTORY_COLLECTIONS, ...HISTORY_SCALARS]);

function same(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function itemKey(item, index) {
  if (item && typeof item === 'object' && item.id !== undefined && item.id !== null) {
    return `id:${item.id}`;
  }
  return `@@index:${index}`;
}

function mergeKeyed(pastArr, currentArr, remoteArr) {
  const past = Array.isArray(pastArr) ? pastArr : [];
  const current = Array.isArray(currentArr) ? currentArr : [];
  const remote = Array.isArray(remoteArr) ? remoteArr : [];
  const pastByKey = new Map(past.map((item, i) => [itemKey(item, i), item]));
  const remoteByKey = new Map(remote.map((item, i) => [itemKey(item, i), item]));

  const out = [];
  for (let i = 0; i < current.length; i++) {
    const item = current[i];
    const key = itemKey(item, i);
    const pastItem = pastByKey.has(key) ? pastByKey.get(key) : undefined;
    const remoteItem = remoteByKey.has(key) ? remoteByKey.get(key) : undefined;
    // Remote touched it (created, deleted, or changed vs the undo target):
    // keep the live version. Otherwise revert to the undo target.
    if (!same(remoteItem, pastItem)) {
      out.push(item);
    } else if (pastItem !== undefined) {
      out.push(pastItem);
    }
    // else: created locally after the undo target — drop it.
  }
  // Objects the undo target has but current doesn't (deleted locally):
  // restore unless the remote side touched them too.
  const currentKeys = new Set(current.map((item, i) => itemKey(item, i)));
  for (let i = 0; i < past.length; i++) {
    const item = past[i];
    const key = itemKey(item, i);
    if (currentKeys.has(key)) continue;
    const remoteItem = remoteByKey.has(key) ? remoteByKey.get(key) : undefined;
    if (same(remoteItem, item)) out.push(item);
  }
  return out;
}

/**
 * Merge an undo/redo target with the live state, protecting everything the
 * remote snapshot changed relative to the target. Pure function.
 */
export function mergeHistorySnapshot(past, current, remote) {
  const merged = {};
  for (const key of HISTORY_COLLECTIONS) {
    merged[key] = mergeKeyed(past?.[key], current?.[key], remote?.[key]);
  }
  for (const key of HISTORY_SCALARS) {
    merged[key] = !same(remote?.[key], past?.[key]) ? current?.[key] : past?.[key];
  }
  return merged;
}

// --- Remote-snapshot bridge -----------------------------------------------
// useAppCollaboration calls notifyRemoteHistory after applying an
// authoritative commit; useWorkspaceHistory subscribes. A module-level
// pub/sub avoids threading callbacks through three hooks.
const listeners = new Set();

export function subscribeRemoteHistory(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyRemoteHistory(snapshot) {
  for (const fn of [...listeners]) {
    try { fn(snapshot); } catch { /* one bad listener must not break undo */ }
  }
}
