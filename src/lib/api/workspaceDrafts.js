import { getLocalStorage, WORKSPACE_KEY } from './storage.js';

// The browser's copy of what a board's server does not have yet (see
// useWorkspacePersistence for when one is kept and when it goes). One draft
// per board, so a draft is only offered back on the board it was made on.
// The old single draft (v1) was rewritten on almost every load whether or
// not anything was unsaved, so it is dropped rather than offered.
const DRAFT_PREFIX = 'homebase.workspace.draft.v2:';
const LEGACY_DRAFT_KEY = 'homebase.workspace.draft.v1';
export const workspaceDraftKey = (workspaceId) => `${DRAFT_PREFIX}${workspaceId}`;

export function readJson(key) {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeJson(key) {
  try { getLocalStorage()?.removeItem(key); } catch { /* best effort */ }
}

export const BOARD_FIELDS = ['wins', 'canvasGroups', 'paths', 'links', 'dock'];

/** JSON with sorted keys: the server keeps boards as jsonb, which reorders them. */
function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${sortedJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Whether a draft holds anything the server copy lacks: its settings, and its
 * board unless the draft says only its settings were unsaved (`board: false`;
 * the shared doc had the board, and the server's copy of it can lag behind).
 */
export function draftHasUnsaved(draft, serverValue) {
  const server = serverValue && typeof serverValue === 'object' ? serverValue : {};
  return Object.keys(draft.value).some((key) => key !== 'workspaceId'
    && !(draft.board === false && BOARD_FIELDS.includes(key))
    && sortedJson(draft.value[key]) !== sortedJson(server[key]));
}

/** A board's unsaved draft; with no board named, the newest draft of any board. */
export function readWorkspaceDraft(workspaceId = null) {
  if (workspaceId) return readJson(workspaceDraftKey(workspaceId));
  const storage = getLocalStorage();
  let newest = null;
  try {
    for (let i = 0; i < (storage?.length || 0); i += 1) {
      const key = storage.key(i);
      const draft = key?.startsWith(DRAFT_PREFIX) ? readJson(key) : null;
      if (draft?.savedAt && !(newest?.savedAt > draft.savedAt)) newest = draft;
    }
  } catch { /* storage unreadable: no draft */ }
  return newest ?? readJson(LEGACY_DRAFT_KEY);
}

export function readWorkspaceRecovery(workspaceId = null) {
  return {
    cachedValue: readJson(WORKSPACE_KEY),
    draft: readWorkspaceDraft(workspaceId),
  };
}

/**
 * Keeps `value` (a board snapshot naming its workspaceId) as that board's
 * draft; `board: false` when only its settings are unsaved.
 */
export function writeWorkspaceDraft(value, baseRevision, { board = true } = {}) {
  if (!value?.workspaceId) return false;
  return writeJson(workspaceDraftKey(value.workspaceId), {
    value,
    baseRevision,
    board,
    savedAt: new Date().toISOString(),
  });
}

export function clearWorkspaceDraft(workspaceId) {
  if (workspaceId) removeJson(workspaceDraftKey(workspaceId));
}

export const dropLegacyDraft = () => removeJson(LEGACY_DRAFT_KEY);
