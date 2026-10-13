import * as Y from 'yjs';
import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from './workspaceHub.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { valueFromY, valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { pdfError } from './pdfAgent.js';

// Agent access to YorWare PDF windows: read the window from the live board
// (falling back to the saved snapshot), and save only the fields an agent
// adds (a form answer, a sign-here flag), so a person working in the same
// PDF at that moment keeps everything they did. Kept apart from
// workspaceMutations.js per the size ratchet.

function requiredText(value, label, maxLength = 128) {
  const result = String(value || '').trim();
  if (!result || result.length > maxLength) throw pdfError(`${label} is required and must be at most ${maxLength} characters.`, 'INVALID_CANVAS_MUTATION');
  return result;
}

export function agentLabel(agentId) {
  return agentId ? `${agentId[0].toUpperCase()}${agentId.slice(1)}` : 'Agent';
}

// The YorWare windows agents can work in through these helpers.
const KIND_NAME = { yorPdf: 'a PDF', yorCad: 'a CAD part' };

function checkKind(win, kind = 'yorPdf') {
  if (!win || win.kind !== kind) {
    const code = kind === 'yorPdf' ? 'CANVAS_WINDOW_NOT_PDF' : 'CANVAS_WINDOW_WRONG_KIND';
    throw pdfError(`That window is not ${KIND_NAME[kind] || kind}. Use canvas_window_index to find one (kind ${kind}).`, code, 422);
  }
  return win;
}

function liveWindows(doc) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  return windows instanceof Y.Map ? windows : null;
}

async function readSnapshotWindow(db, workspaceId, windowId) {
  const { rows } = await db.query(
    'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2',
    [workspaceId, WORKSPACE_STATE_KEY],
  );
  const windows = Array.isArray(rows[0]?.value?.wins) ? rows[0].value.wins : [];
  return windows.find((win) => win.id === windowId) || null;
}

/** The PDF (or other YorWare `kind`) window as everyone on the board sees it right now. */
export async function loadPdfWindow(db, { workspaceId, windowId, kind = 'yorPdf' }) {
  const id = requiredText(workspaceId, 'workspaceId');
  const winId = requiredText(windowId, 'window_id');
  let live = null;
  const running = await transactCanvasDoc(id, (doc) => {
    const entry = liveWindows(doc)?.get(winId);
    if (entry instanceof Y.Map) live = valueFromY(entry);
  }).catch(() => false);
  if (running && live) return checkKind(live, kind);
  return checkKind(await readSnapshotWindow(db, id, winId), kind);
}

/**
 * Save some fields of a PDF window: into the live board (every browser sees
 * it at once) and into the saved snapshot when the window is there.
 */
export async function savePdfFields(db, { workspaceId, windowId, agentId, fields, activity, kind = 'yorPdf' }) {
  const id = requiredText(workspaceId, 'workspaceId');
  const winId = requiredText(windowId, 'window_id');
  const actorId = requiredText(agentId, 'agentId');
  const client = await db.connect();
  let committed = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [id, WORKSPACE_STATE_KEY],
    );
    const value = structuredClone(rows[0]?.value || {});
    const windows = Array.isArray(value.wins) ? value.wins : [];
    const index = windows.findIndex((win) => win.id === winId && win.kind === kind);
    if (index >= 0) {
      const now = new Date().toISOString();
      windows[index] = { ...windows[index], ...fields, updatedAt: now };
      value.wins = windows;
      value.updatedAt = now;
      const updated = await client.query(
        `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
         WHERE workspace_id=$1 AND key=$2 RETURNING revision,updated_at`,
        [id, WORKSPACE_STATE_KEY, JSON.stringify(value)],
      );
      committed = { revision: Number(updated.rows[0].revision), value };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  let mirrored = false;
  await transactCanvasDoc(id, (doc) => {
    const entry = liveWindows(doc)?.get(winId);
    if (!(entry instanceof Y.Map)) return;
    for (const [field, v] of Object.entries(fields)) entry.set(field, valueToY(v));
    mirrored = true;
  }).catch(() => false);
  if (!committed && !mirrored) throw pdfError(`That ${kind === 'yorPdf' ? 'PDF' : 'CAD'} window was not found on the board.`, 'CANVAS_WINDOW_NOT_FOUND', 404);

  const label = agentLabel(actorId);
  if (committed) {
    publishWorkspaceEvent(id, {
      type: 'workspace.committed',
      workspaceId: id,
      revision: committed.revision,
      value: committed.value,
      sourceClientId: null,
      actor: { type: 'agent', id: actorId, label },
      activity: { kind: activity.kind, windowId: winId, label: `${label} ${activity.label}` },
    });
  }
  return { revision: committed?.revision ?? null, live: mirrored };
}
