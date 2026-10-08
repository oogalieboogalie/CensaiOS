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
export async function transactCanvasDoc(workspaceId, mutate) {
  if (!liveHocuspocus || !ID_PATTERN.test(String(workspaceId ?? ''))) return false;
  const connection = await liveHocuspocus.openDirectConnection(String(workspaceId), { serverWriter: true });
  try {
    await connection.transact((doc) => mutate(doc));
  } finally {
    await connection.disconnect();
  }
  return true;
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
