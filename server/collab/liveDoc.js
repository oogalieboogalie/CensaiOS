// server/collab/liveDoc.js
//
// Registry for the running Hocuspocus instance, kept import-free so
// server-side writers (agents) can reach the live canvas CRDT without
// pulling the whole collaboration server into their module graph.

const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

let liveHocuspocus = null;

export function registerLiveHocuspocus(instance) {
  liveHocuspocus = instance;
}

/**
 * Run `mutate(doc)` inside a transaction on a workspace's Yjs document. Loads
 * the doc through the persistence extension if no browser has it open, and
 * every connected browser receives the change live. Returns false when the
 * collaboration server isn't running (tests, scripts).
 */
export async function transactCanvasDoc(workspaceId, mutate, context = {}) {
  if (!liveHocuspocus || !ID_PATTERN.test(String(workspaceId ?? ''))) return false;
  const connection = await liveHocuspocus.openDirectConnection(String(workspaceId), { ...context, serverWriter: true });
  try {
    await connection.transact((doc) => mutate(doc));
  } finally {
    await connection.disconnect();
  }
  return true;
}

/**
 * The update log the running server writes to (the persistence extension's
 * own instance, so its queued rows are flushed before history is read), or
 * null when the collaboration server isn't running.
 */
export function liveUpdateLog() {
  const extensions = liveHocuspocus?.configuration?.extensions || [];
  return extensions.find((extension) => extension?.extensionName === 'yjs-postgres-persistence')?.updateLog ?? null;
}

/**
 * Hold a read connection to a workspace's live canvas doc (for the guest
 * board projector). Returns { doc, close } or null when the collaboration
 * server isn't running.
 */
export async function openCanvasDocReader(workspaceId) {
  if (!liveHocuspocus || !ID_PATTERN.test(String(workspaceId ?? ''))) return null;
  const connection = await liveHocuspocus.openDirectConnection(String(workspaceId), { guestProjector: true });
  return {
    doc: connection.document,
    close: () => connection.disconnect(),
  };
}

/**
 * Hold a connection to a workspace's canvas doc only while browsers have it
 * open (agent cursors: nobody watching means nothing to show, and no reason
 * to load the doc). Returns { doc, close } or null.
 */
export async function openWatchedCanvasDoc(workspaceId) {
  if (!liveHocuspocus || !ID_PATTERN.test(String(workspaceId ?? ''))) return null;
  const loaded = liveHocuspocus.documents?.get?.(String(workspaceId));
  if (!loaded || !loaded.getConnections?.().length) return null;
  const connection = await liveHocuspocus.openDirectConnection(String(workspaceId), { agentPresence: true });
  return {
    doc: connection.document,
    close: () => connection.disconnect(),
  };
}
