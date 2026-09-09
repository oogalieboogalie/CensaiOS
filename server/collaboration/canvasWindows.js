import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from './workspaceHub.js';
import { persistCollaborationEpisodesSafely } from './episodeStore.js';
import { MAX_PREVIEW_BYTES } from './previewBuilder.js';
import { randomUUID } from 'crypto';

// Window spawn + index operations for agent canvas collaboration.
// Split out of workspaceMutations.js per the size ratchet (existing files
// may only shrink). The tiny validation helpers below mirror that module
// deliberately — no cross-imports, no cycles.

const MAX_APPEND_BYTES = 8 * 1024;
const MAX_INDEX_PER_PAGE = 50;

const SPAWNABLE_KINDS = Object.freeze({
  doc: { w: 560, h: 460 },
  code_editor: { w: 680, h: 480 },
  htmlPreview: { w: 720, h: 520 },
});
const PLACEMENT_GAP = 40;

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

function requiredKind(value) {
  const kind = String(value || '').trim();
  if (!SPAWNABLE_KINDS[kind]) {
    throw collaborationError(
      `kind must be one of: ${Object.keys(SPAWNABLE_KINDS).join(', ')}.`,
      'INVALID_CANVAS_WINDOW_KIND');
  }
  return kind;
}

function windowLabel(win) {
  return win.fileName || win.title || (win.kind === 'doc' ? 'Document' : 'Code Editor');
}

function placementFor(windows, nearId) {
  const near = nearId ? windows.find((win) => win.id === nearId) : null;
  if (near && Number.isFinite(near.x) && Number.isFinite(near.y)) {
    return {
      x: Math.max(0, (near.x || 0) + (near.w || 400) + PLACEMENT_GAP),
      y: Math.max(0, near.y || 0),
    };
  }
  const rightEdge = windows.reduce((max, win) => (
    Number.isFinite(win.x) && Number.isFinite(win.w) ? Math.max(max, win.x + win.w) : max
  ), 0);
  return { x: rightEdge + PLACEMENT_GAP || 100, y: 120 };
}

/**
 * Spawn a new document/code window on the shared canvas, placed next to
 * `nearWindowId` (or at the right edge). Bumps the revision and broadcasts
 * so every connected client renders it without a reload.
 */
export async function spawnCanvasWindow(db, {
  workspaceId, agentId, kind, title, content = '', nearWindowId = null,
  html = '', previewType = '', fileName = '',
}) {
  const id = requiredText(workspaceId, 'workspaceId');
  const actorId = requiredText(agentId, 'agentId');
  const winKind = requiredKind(kind);
  const winTitle = requiredText(title, 'title', 120);
  const text = String(content || '');
  const previewHtml = String(html || '');
  // Projected previews (html/threejs/react/...) are standalone documents and
  // legitimately larger than a chat-typed note; they get their own ceiling.
  const payload = winKind === 'htmlPreview' ? previewHtml : text;
  const maxBytes = winKind === 'htmlPreview' ? MAX_PREVIEW_BYTES : MAX_APPEND_BYTES;
  if (Buffer.byteLength(payload, 'utf8') > maxBytes) {
    throw collaborationError(`content must contain at most ${maxBytes} UTF-8 bytes.`, 'INVALID_CANVAS_CONTENT');
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
    const at = placementFor(windows, nearWindowId ? requiredText(nearWindowId, 'nearWindowId') : null);
    const size = SPAWNABLE_KINDS[winKind];
    const now = new Date().toISOString();
    const win = {
      id: randomUUID(),
      kind: winKind,
      title: winTitle,
      x: at.x, y: at.y, w: size.w, h: size.h,
      createdBy: actorId,
      updatedAt: now,
      ...(winKind === 'doc'
        ? { fileName: winTitle, text }
        : winKind === 'htmlPreview'
          ? {
              fileName: String(fileName || '').trim() || winTitle,
              html: previewHtml,
              previewType: String(previewType || '').trim() || 'html',
            }
          : { fileName: winTitle, code: text }),
    };
    value.wins = [...windows, win];
    value.updatedAt = now;
    const updated = await client.query(
      `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
       WHERE workspace_id=$1 AND key=$2 RETURNING revision,updated_at`,
      [id, WORKSPACE_STATE_KEY, JSON.stringify(value)]
    );
    committed = {
      workspaceId: id,
      revision: Number(updated.rows[0].revision),
      value,
      window: win,
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
      kind: 'canvas.window.spawned',
      windowId: committed.window.id,
      label: `${label} opened ${committed.window.title}`,
    },
  });
  return committed;
}

/**
 * Compact alphabetical index of canvas windows for agents: id/kind/label
 * rows with query filter + pagination, so a big canvas never floods context.
 */
export async function listCanvasWindowIndex(db, workspaceId, { query = '', page = 1, perPage = 20 } = {}) {
  const id = requiredText(workspaceId, 'workspaceId');
  const { rows } = await db.query(
    'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2',
    [id, WORKSPACE_STATE_KEY]
  );
  const row = rows[0];
  if (!row) return { revision: 0, total: 0, page: 1, perPage, windows: [] };
  const windows = Array.isArray(row.value?.wins) ? row.value.wins : [];
  const q = String(query || '').trim().toLowerCase();
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safePerPage = Number.isSafeInteger(perPage)
    ? Math.min(Math.max(perPage, 1), MAX_INDEX_PER_PAGE)
    : 20;
  const indexed = windows
    .map((win) => ({ id: win.id, kind: win.kind, label: windowLabel(win) }))
    .filter((win) => !q || win.label.toLowerCase().includes(q))
    .sort((a, b) => a.label.localeCompare(b.label));
  const start = (safePage - 1) * safePerPage;
  return {
    revision: Number(row.revision),
    total: indexed.length,
    page: safePage,
    perPage: safePerPage,
    windows: indexed.slice(start, start + safePerPage),
  };
}
