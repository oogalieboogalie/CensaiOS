import { CLIENT_STATE_ENDPOINT, WORKSPACE_KEY } from './storage.js';
import { getCollaborationClientId } from '../collaboration/clientIdentity.js';
import {
  BOARD_FIELDS, clearWorkspaceDraft, draftHasUnsaved, dropLegacyDraft, readWorkspaceDraft, readWorkspaceRecovery,
  removeJson, writeJson,
} from './workspaceDrafts.js';

export {
  clearWorkspaceDraft, readWorkspaceDraft, readWorkspaceRecovery, workspaceDraftKey, writeWorkspaceDraft,
} from './workspaceDrafts.js';

function endpoint(workspaceId = null) {
  const base = `${CLIENT_STATE_ENDPOINT}/${encodeURIComponent(WORKSPACE_KEY)}`;
  return workspaceId ? `${base}?workspaceId=${encodeURIComponent(workspaceId)}` : base;
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

export async function loadWorkspaceAuthoritatively({ timeoutMs = 4000, workspaceId = null } = {}) {
  let response;
  try {
    response = await fetchWithTimeout(endpoint(workspaceId), {}, timeoutMs);
  } catch (error) {
    return { status: 'unavailable', error, ...readWorkspaceRecovery(workspaceId) };
  }

  if (response.status === 404) {
    if (workspaceId) {
      return { status: 'ready', value: null, revision: 0, workspaceId };
    }
    // An empty workspace still has a server identity (e.g. `user-1-default`).
    // Adopt it: a client-minted id is unknown to the server, so collaboration
    // sockets and saves for it are refused.
    const empty = await response.json().catch(() => ({}));
    const serverWorkspaceId = typeof empty?.workspaceId === 'string' ? empty.workspaceId : null;
    const recovery = readWorkspaceRecovery(serverWorkspaceId);
    const recoverable = recovery.draft?.value ?? recovery.cachedValue;
    return recoverable
      ? { status: 'restore_required', value: recoverable, revision: 0, workspaceId: serverWorkspaceId, ...recovery }
      : { status: 'ready', value: null, revision: 0, workspaceId: serverWorkspaceId };
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return {
      status: 'unavailable',
      error: workspaceError(payload.error || `Workspace load failed (HTTP ${response.status})`, {
        status: response.status,
      }),
      ...readWorkspaceRecovery(workspaceId),
    };
  }

  const payload = await response.json();
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
    return {
      status: 'unavailable',
      error: workspaceError('Workspace server returned an invalid revision'),
      ...readWorkspaceRecovery(workspaceId),
    };
  }
  writeJson(WORKSPACE_KEY, payload.value);
  dropLegacyDraft();
  const board = payload.workspaceId || workspaceId;
  const draft = board ? readWorkspaceDraft(board) : null;
  if (draft?.value && draftHasUnsaved(draft, payload.value)) {
    return {
      status: 'draft_required',
      value: payload.value,
      draft,
      revision: payload.revision,
      workspaceId: payload.workspaceId,
    };
  }
  clearWorkspaceDraft(board);
  return {
    status: 'ready',
    value: payload.value,
    revision: payload.revision,
    workspaceId: payload.workspaceId,
  };
}

/** Current server revision of a workspace (0 when it has never been saved). */
export async function fetchWorkspaceRevision(workspaceId = null, { timeoutMs = 4000 } = {}) {
  const response = await fetchWithTimeout(endpoint(workspaceId), {}, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) return 0;
  if (!response.ok || !Number.isSafeInteger(payload.revision)) {
    throw workspaceError(payload.error || `Workspace revision lookup failed (HTTP ${response.status})`, {
      status: response.status,
    });
  }
  return payload.revision;
}

function withoutBoard(value) {
  if (!value || typeof value !== 'object') return value;
  const out = { ...value };
  for (const key of BOARD_FIELDS) delete out[key];
  return out;
}

// canvasSource 'yjs': the canvas lives in the shared doc, so the server keeps
// its own canvas fields and merges only the settings (no revision conflict).
// `keepalive`: the save still goes out when the page is closing.
export async function saveWorkspaceAuthoritatively(value, expectedRevision, { timeoutMs = 8000, canvasSource = null, keepalive = false } = {}) {
  const enriched = value && typeof value === 'object'
    ? { ...value, updatedAt: new Date().toISOString() }
    : value;
  const response = await fetchWithTimeout(endpoint(), {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // The board itself travels only through the shared doc.
      value: canvasSource === 'yjs' ? withoutBoard(enriched) : enriched,
      expectedRevision,
      clientId: getCollaborationClientId(),
      ...(canvasSource ? { canvasSource } : {}),
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
  // On the shared board, the board half of a draft is the doc's to confirm,
  // so useWorkspacePersistence decides when the draft goes.
  if (canvasSource !== 'yjs') clearWorkspaceDraft(payload.workspaceId || value?.workspaceId);
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
  clearWorkspaceDraft(payload.workspaceId);
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
