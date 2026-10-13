const MAX_CLIENTS_PER_WORKSPACE = 64;
// Stream audiences (spec 5 "Go live") are counted apart from the people
// working on the board, so a big audience can't lock teammates out.
const MAX_SPECTATORS_PER_WORKSPACE = 200;

const workspaces = new Map();

function bucketFor(workspaceId, create = false) {
  let bucket = workspaces.get(workspaceId);
  if (!bucket && create) {
    bucket = new Map();
    workspaces.set(workspaceId, bucket);
  }
  return bucket;
}

function safeDeliver(entry, event) {
  try {
    entry.send(event);
    return true;
  } catch {
    return false;
  }
}

export function listWorkspaceParticipants(workspaceId) {
  const bucket = bucketFor(workspaceId);
  if (!bucket) return [];
  return [...bucket.values()]
    .filter((entry) => !entry.spectator)
    .map(({ clientId, actor }) => ({ clientId, actor }));
}

export function countWorkspaceSpectators(workspaceId) {
  const bucket = bucketFor(workspaceId);
  if (!bucket) return 0;
  let count = 0;
  for (const entry of bucket.values()) if (entry.spectator) count += 1;
  return count;
}

export function joinWorkspaceClient({ workspaceId, clientId, actor, send, spectator = false, access = null }) {
  const bucket = bucketFor(workspaceId, true);
  if (!bucket.has(clientId)) {
    const spectators = countWorkspaceSpectators(workspaceId);
    const full = spectator
      ? spectators >= MAX_SPECTATORS_PER_WORKSPACE
      : bucket.size - spectators >= MAX_CLIENTS_PER_WORKSPACE;
    if (full) {
      if (bucket.size === 0) workspaces.delete(workspaceId);
      const error = new Error('Workspace collaboration capacity reached');
      error.code = 'collaboration_capacity';
      throw error;
    }
  }
  const entry = { workspaceId, clientId, actor, send, spectator: Boolean(spectator), access };
  bucket.set(clientId, entry);
  return entry;
}

export function leaveWorkspaceClient(workspaceId, clientId, send = null) {
  const bucket = bucketFor(workspaceId);
  const current = bucket?.get(clientId);
  if (!current || (send && current.send !== send)) return false;
  bucket.delete(clientId);
  if (bucket.size === 0) workspaces.delete(workspaceId);
  return true;
}

/**
 * Deliver an event to everyone on a board. Guests who joined by share link
 * only get events published with `guests: true`: anything else (snapshot
 * commits, agent run tails) may carry board content their link hides.
 */
export function publishWorkspaceEvent(workspaceId, event, { excludeClientId = null, filter = null, guests = false } = {}) {
  const bucket = bucketFor(workspaceId);
  if (!bucket) return 0;
  let delivered = 0;
  for (const entry of bucket.values()) {
    if (excludeClientId && entry.clientId === excludeClientId) continue;
    if (!guests && entry.actor?.type === 'guest') continue;
    if (filter && !filter(entry)) continue;
    if (safeDeliver(entry, event)) delivered += 1;
  }
  return delivered;
}

export function publishPresence(workspaceId) {
  return publishWorkspaceEvent(workspaceId, {
    type: 'presence.snapshot',
    participants: listWorkspaceParticipants(workspaceId),
    spectators: countWorkspaceSpectators(workspaceId),
  }, { guests: true });
}

export function __resetWorkspaceHubForTests() {
  workspaces.clear();
}

export const WORKSPACE_HUB_LIMITS = Object.freeze({
  maxClientsPerWorkspace: MAX_CLIENTS_PER_WORKSPACE,
  maxSpectatorsPerWorkspace: MAX_SPECTATORS_PER_WORKSPACE,
});
