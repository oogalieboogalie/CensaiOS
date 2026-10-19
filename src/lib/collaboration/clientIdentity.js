import { newId } from '../ids/newId.js';
const CLIENT_ID_KEY = 'homebase.collaboration.client.v1';
let fallbackId = null;

function createId() {
  return newId();
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
