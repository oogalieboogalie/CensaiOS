const MAX_CLIENTS_PER_WORKSPACE = 64;

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
  return [...bucket.values()].map(({ clientId, actor }) => ({ clientId, actor }));
}

export function joinWorkspaceClient({ workspaceId, clientId, actor, send }) {
  const bucket = bucketFor(workspaceId, true);
  if (!bucket.has(clientId) && bucket.size >= MAX_CLIENTS_PER_WORKSPACE) {
    const error = new Error('Workspace collaboration capacity reached');
    error.code = 'collaboration_capacity';
    throw error;
  }
  const entry = { workspaceId, clientId, actor, send };
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

export function publishWorkspaceEvent(workspaceId, event, { excludeClientId = null } = {}) {
  const bucket = bucketFor(workspaceId);
  if (!bucket) return 0;
  let delivered = 0;
  for (const entry of bucket.values()) {
    if (excludeClientId && entry.clientId === excludeClientId) continue;
    if (safeDeliver(entry, event)) delivered += 1;
  }
  return delivered;
}

export function publishPresence(workspaceId) {
  return publishWorkspaceEvent(workspaceId, {
    type: 'presence.snapshot',
    participants: listWorkspaceParticipants(workspaceId),
  });
}

export function __resetWorkspaceHubForTests() {
  workspaces.clear();
}

export const WORKSPACE_HUB_LIMITS = Object.freeze({
  maxClientsPerWorkspace: MAX_CLIENTS_PER_WORKSPACE,
});
