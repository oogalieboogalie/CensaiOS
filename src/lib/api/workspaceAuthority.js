import { CLIENT_STATE_ENDPOINT, getLocalStorage, WORKSPACE_KEY } from './storage.js';
import { getCollaborationClientId } from '../collaboration/clientIdentity.js';

export const WORKSPACE_DRAFT_KEY = 'homebase.workspace.draft.v1';

function readJson(key) {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeJson(key) {
  try { getLocalStorage()?.removeItem(key); } catch { /* best effort */ }
}

function endpoint(workspaceId = null) {
  const base = `${CLIENT_STATE_ENDPOINT}/${encodeURIComponent(WORKSPACE_KEY)}`;
  return workspaceId ? `${base}?workspaceId=${encodeURIComponent(workspaceId)}` : base;
}

function sameValue(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function workspaceError(message, { code = 'workspace_unavailable', status = 0 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw workspaceError('Workspace server timed out');
    throw workspaceError('Workspace server could not be reached');
  } finally {
    clearTimeout(timer);
  }
}

export function readWorkspaceRecovery() {
  return {
    cachedValue: readJson(WORKSPACE_KEY),
    draft: readJson(WORKSPACE_DRAFT_KEY),
  };
}

export function writeWorkspaceDraft(value, baseRevision) {
  return writeJson(WORKSPACE_DRAFT_KEY, {
    value,
    baseRevision,
    savedAt: new Date().toISOString(),
  });
}

export function clearWorkspaceDraft() {
  removeJson(WORKSPACE_DRAFT_KEY);
}

export async function loadWorkspaceAuthoritatively({ timeoutMs = 4000, workspaceId = null } = {}) {
  const recovery = readWorkspaceRecovery();
  let response;
  try {
    response = await fetchWithTimeout(endpoint(workspaceId), {}, timeoutMs);
  } catch (error) {
    return { status: 'unavailable', error, ...recovery };
  }

  if (response.status === 404) {
    if (workspaceId) {
      return { status: 'ready', value: null, revision: 0, workspaceId };
    }
    const recoverable = recovery.draft?.value ?? recovery.cachedValue;
    return recoverable
      ? { status: 'restore_required', value: recoverable, revision: 0, ...recovery }
      : { status: 'ready', value: null, revision: 0, workspaceId: null };
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return {
      status: 'unavailable',
      error: workspaceError(payload.error || `Workspace load failed (HTTP ${response.status})`, {
        status: response.status,
      }),
      ...recovery,
    };
  }

  const payload = await response.json();
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
    return {
      status: 'unavailable',
      error: workspaceError('Workspace server returned an invalid revision'),
      ...recovery,
    };
  }
  writeJson(WORKSPACE_KEY, payload.value);
  if (recovery.draft?.value && !sameValue(recovery.draft.value, payload.value)) {
    return {
      status: 'draft_required',
      value: payload.value,
      draft: recovery.draft,
      revision: payload.revision,
      workspaceId: payload.workspaceId,
    };
  }
  clearWorkspaceDraft();
  return {
    status: 'ready',
    value: payload.value,
    revision: payload.revision,
    workspaceId: payload.workspaceId,
  };
}

export async function saveWorkspaceAuthoritatively(value, expectedRevision, { timeoutMs = 8000 } = {}) {
  const enriched = value && typeof value === 'object'
    ? { ...value, updatedAt: new Date().toISOString() }
    : value;
  const response = await fetchWithTimeout(endpoint(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value: enriched,
      expectedRevision,
      clientId: getCollaborationClientId(),
    }),
  }, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw workspaceError(payload.error || `Workspace save failed (HTTP ${response.status})`, {
      code: response.status === 409 ? 'workspace_revision_conflict' : 'workspace_save_failed',
      status: response.status,
    });
  }
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
    throw workspaceError('Workspace server returned an invalid save revision');
  }
  writeJson(WORKSPACE_KEY, enriched);
  clearWorkspaceDraft();
  return { ...payload, value: enriched };
}

export async function deleteWorkspaceAuthoritatively(expectedRevision, { timeoutMs = 8000 } = {}) {
  const url = `${endpoint()}?expectedRevision=${encodeURIComponent(expectedRevision)}`;
  const response = await fetchWithTimeout(url, { method: 'DELETE' }, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw workspaceError(payload.error || `Workspace reset failed (HTTP ${response.status})`, {
      code: response.status === 409 ? 'workspace_revision_conflict' : 'workspace_reset_failed',
      status: response.status,
    });
  }
  removeJson(WORKSPACE_KEY);
  clearWorkspaceDraft();
  return payload;
}

export function downloadWorkspaceSnapshot(value, label = 'recovery') {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `censai-workspace-${label}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
