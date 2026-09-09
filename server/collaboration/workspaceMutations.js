import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from './workspaceHub.js';
import { persistCollaborationEpisodesSafely } from './episodeStore.js';

const SUPPORTED_WINDOW_FIELDS = Object.freeze({ doc: 'text', code_editor: 'code' });
const MAX_APPEND_BYTES = 8 * 1024;
const MAX_WINDOW_TEXT_BYTES = 256 * 1024;
const MAX_INDEX_PER_PAGE = 50;

function collaborationError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function requiredText(value, label, maxLength = 128) {
  const result = String(value || '').trim();
  if (!result || result.length > maxLength) {
    throw collaborationError(`${label} is required and must be at most ${maxLength} characters.`,
      'INVALID_CANVAS_MUTATION');
  }
  return result;
}

function agentLabel(agentId) {
  return agentId ? `${agentId[0].toUpperCase()}${agentId.slice(1)}` : 'Agent';
}

function writableField(win) {
  if (!win || win.filePath || win.codeServerUrl) return null;
  return SUPPORTED_WINDOW_FIELDS[win.kind] || null;
}

export async function listCollaborativeCanvasWindows(db, workspaceId) {
  const id = requiredText(workspaceId, 'workspaceId');
  const { rows } = await db.query(
    'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2',
    [id, WORKSPACE_STATE_KEY]
  );
  const row = rows[0];
  if (!row) return { revision: 0, windows: [] };
  const windows = Array.isArray(row.value?.wins) ? row.value.wins : [];
  return {
    revision: Number(row.revision),
    windows: windows.filter((win) => writableField(win)).map((win) => ({
      id: win.id,
      kind: win.kind,
      label: win.fileName || win.title || (win.kind === 'doc' ? 'Document' : 'Code Editor'),
    })),
  };
}

export async function appendCollaborativeWindowText(db, {
  workspaceId, windowId, agentId, content,
}) {
  const id = requiredText(workspaceId, 'workspaceId');
  const winId = requiredText(windowId, 'windowId');
  const actorId = requiredText(agentId, 'agentId');
  const addition = String(content || '');
  if (!addition.trim() || Buffer.byteLength(addition, 'utf8') > MAX_APPEND_BYTES) {
    throw collaborationError('content must contain 1 to 8192 UTF-8 bytes.', 'INVALID_CANVAS_CONTENT');
  }

  const client = await db.connect();
  let committed;
  let previousValue;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [id, WORKSPACE_STATE_KEY]
    );
    if (!rows[0]) {
      throw collaborationError('Workspace canvas state was not found.', 'CANVAS_STATE_NOT_FOUND', 404);
    }
    previousValue = structuredClone(rows[0].value || {});
    const value = structuredClone(previousValue);
    const windows = Array.isArray(value.wins) ? value.wins : [];
    const index = windows.findIndex((win) => win.id === winId);
    const win = windows[index];
    const field = writableField(win);
    if (!field) {
      throw collaborationError('Only document and code editor windows support agent append.',
        'CANVAS_WINDOW_NOT_WRITABLE', 422);
    }
    const current = String(win[field] || '');
    const separator = current && !current.endsWith('\n') ? '\n' : '';
    const nextText = `${current}${separator}${addition}`;
    if (Buffer.byteLength(nextText, 'utf8') > MAX_WINDOW_TEXT_BYTES) {
      throw collaborationError('The target window exceeds the 256 KiB collaboration limit.',
        'CANVAS_WINDOW_TOO_LARGE', 413);
    }
    windows[index] = { ...win, [field]: nextText, updatedAt: new Date().toISOString() };
    value.wins = windows;
    value.updatedAt = new Date().toISOString();
    const updated = await client.query(
      `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
       WHERE workspace_id=$1 AND key=$2 RETURNING revision,updated_at`,
      [id, WORKSPACE_STATE_KEY, JSON.stringify(value)]
    );
    committed = {
      workspaceId: id,
      revision: Number(updated.rows[0].revision),
      value,
      window: windows[index],
    };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const label = agentLabel(actorId);
  await persistCollaborationEpisodesSafely(db, {
    workspaceId: id,
    previousValue,
    nextValue: committed.value,
    revision: committed.revision,
    actor: { type: 'agent', id: actorId, label },
  });
  publishWorkspaceEvent(id, {
    type: 'workspace.committed',
    workspaceId: id,
    revision: committed.revision,
    value: committed.value,
    sourceClientId: null,
    actor: { type: 'agent', id: actorId, label },
    activity: {
      kind: 'canvas.window.appended',
      windowId: winId,
      label: `${label} updated ${committed.window.fileName || committed.window.title || committed.window.kind}`,
    },
  });
  return committed;
}

export const CANVAS_COLLABORATION_LIMITS = Object.freeze({
  maxAppendBytes: MAX_APPEND_BYTES,
  maxWindowTextBytes: MAX_WINDOW_TEXT_BYTES,
  supportedKinds: Object.freeze(Object.keys(SUPPORTED_WINDOW_FIELDS)),
  maxIndexPerPage: MAX_INDEX_PER_PAGE,
});

// Window spawn + alphabetical index live in canvasWindows.js (size ratchet:
// this file may only shrink). Re-exported here so existing importers keep
// working without changes.
export { spawnCanvasWindow, listCanvasWindowIndex } from './canvasWindows.js';
