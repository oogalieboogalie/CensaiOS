const CLIENT_ID_KEY = 'homebase.collaboration.client.v1';
let fallbackId = null;

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCollaborationClientId() {
  if (fallbackId) return fallbackId;
  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = createId();
    window.sessionStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    fallbackId = createId();
    return fallbackId;
  }
}
