import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from './workspaceHub.js';
import { persistCollaborationEpisodesSafely } from './episodeStore.js';
import { mirrorWindowToCanvas } from '../collab/serverWriter.js';

// Agent access to design blocks: the borderless code windows that Figma
// imports and canvas pastes create. An agent reads a block's code and swaps
// in a full rewrite; the previous code is kept so the block's Undo works.
// Kept apart from workspaceMutations.js per the size ratchet.

export const MAX_DESIGN_SOURCE_BYTES = 256 * 1024;
const SOURCE_TYPES = new Set(['html', 'tailwind', 'react', 'svg', 'css']);

function designError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function requiredText(value, label, maxLength = 128) {
  const result = String(value || '').trim();
  if (!result || result.length > maxLength) {
    throw designError(`${label} is required and must be at most ${maxLength} characters.`, 'INVALID_CANVAS_MUTATION');
  }
  return result;
}

function agentLabel(agentId) {
  return agentId ? `${agentId[0].toUpperCase()}${agentId.slice(1)}` : 'Agent';
}

function findBlock(windows, windowId) {
  const index = windows.findIndex((win) => win.id === windowId);
  const win = windows[index];
  if (!win || win.kind !== 'designBlock') {
    throw designError('That window is not a design block. Use canvas_window_index to find one (kind designBlock).',
      'CANVAS_WINDOW_NOT_DESIGN', 422);
  }
  return { index, win };
}

export async function readDesignBlock(db, { workspaceId, windowId }) {
  const id = requiredText(workspaceId, 'workspaceId');
  const winId = requiredText(windowId, 'windowId');
  const { rows } = await db.query(
    'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2',
    [id, WORKSPACE_STATE_KEY],
  );
  const windows = Array.isArray(rows[0]?.value?.wins) ? rows[0].value.wins : [];
  const { win } = findBlock(windows, winId);
  return {
    id: win.id,
    title: win.title || 'Design',
    sourceType: SOURCE_TYPES.has(win.sourceType) ? win.sourceType : 'html',
    source: String(win.source || ''),
    width: win.w || null,
    height: win.h || null,
    figma: win.figma || null,
  };
}

export async function replaceDesignBlockSource(db, {
  workspaceId, windowId, agentId, source, sourceType,
}) {
  const id = requiredText(workspaceId, 'workspaceId');
  const winId = requiredText(windowId, 'windowId');
  const actorId = requiredText(agentId, 'agentId');
  const next = String(source || '');
  if (!next.trim() || Buffer.byteLength(next, 'utf8') > MAX_DESIGN_SOURCE_BYTES) {
    throw designError('source must contain 1 byte to 256 KiB of code.', 'INVALID_CANVAS_CONTENT');
  }
  const type = sourceType ? String(sourceType).trim().toLowerCase() : null;
  if (type && !SOURCE_TYPES.has(type)) {
    throw designError(`source_type must be one of: ${[...SOURCE_TYPES].join(', ')}.`, 'INVALID_CANVAS_CONTENT');
  }

  const client = await db.connect();
  let committed;
  let previousValue;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [id, WORKSPACE_STATE_KEY],
    );
    if (!rows[0]) throw designError('Workspace canvas state was not found.', 'CANVAS_STATE_NOT_FOUND', 404);
    previousValue = structuredClone(rows[0].value || {});
    const value = structuredClone(previousValue);
    const windows = Array.isArray(value.wins) ? value.wins : [];
    const { index, win } = findBlock(windows, winId);
    const now = new Date().toISOString();
    windows[index] = {
      ...win,
      source: next,
      ...(type ? { sourceType: type } : {}),
      previousSource: String(win.source || ''),
      // An agent's edit is code; show it, not the old Figma render.
      view: 'live',
      editedBy: { type: 'agent', id: actorId, at: now },
      updatedAt: now,
    };
    value.wins = windows;
    value.updatedAt = now;
    const updated = await client.query(
      `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
       WHERE workspace_id=$1 AND key=$2 RETURNING revision,updated_at`,
      [id, WORKSPACE_STATE_KEY, JSON.stringify(value)],
    );
    committed = { workspaceId: id, revision: Number(updated.rows[0].revision), value, window: windows[index] };
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
  await mirrorWindowToCanvas(id, committed.window);
  publishWorkspaceEvent(id, {
    type: 'workspace.committed',
    workspaceId: id,
    revision: committed.revision,
    value: committed.value,
    sourceClientId: null,
    actor: { type: 'agent', id: actorId, label },
    activity: {
      kind: 'canvas.design.updated',
      windowId: winId,
      label: `${label} edited the design ${committed.window.title || ''}`.trim(),
    },
  });
  return committed;
}
