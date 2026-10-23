// Spec 7: what the real estate agents' tools read from and write to on a
// board. Template windows carry a `templateRole` ("teamChat", "outbox",
// "dealPipeline"), so a tool finds the Team Chat without knowing its id.
//
// Reads prefer the live canvas doc (what people see right now) and fall
// back to the saved snapshot. Appends go to both: the live doc so open
// boards see the message at once (a Y.Array push, so two writers never
// drop each other's item), the snapshot so a board opened later has it.

import * as Y from 'yjs';
import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { docToSnapshot, valueFromY, valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('real-estate');
const MAX_LIST_ITEMS = 200;

export function findTemplateWindow(windows, role) {
  return (Array.isArray(windows) ? windows : []).find(win => win?.templateRole === role) || null;
}

async function readSnapshotWindows(db, workspaceId) {
  const { rows } = await db.query(
    'SELECT value FROM workspace_client_state WHERE workspace_id=$1 AND key=$2',
    [workspaceId, WORKSPACE_STATE_KEY],
  );
  return Array.isArray(rows[0]?.value?.wins) ? rows[0].value.wins : [];
}

/** The board's windows, live when the board is open somewhere. */
export async function readBoardWindows(db, workspaceId, { live = transactCanvasDoc } = {}) {
  let liveWindows = null;
  try {
    await live(workspaceId, (doc) => { liveWindows = docToSnapshot(doc).wins; });
  } catch (error) {
    log.warn('live board read failed', { workspaceId, code: safeErrorCode(error) });
  }
  if (Array.isArray(liveWindows) && liveWindows.length) return liveWindows;
  return readSnapshotWindows(db, workspaceId);
}

/** Does this window belong to the agent? (Starter boards list their agents on the Team Chat.) */
export function windowHasAgent(win, owner) {
  const ids = win?.teamAgents;
  return Boolean(owner) && Array.isArray(ids) && ids.includes(owner);
}

/** Of the windows with this role, the owner's own first, then the first one. */
export function pickRoleWindow(entries, role, owner) {
  const matches = entries.filter(([, win]) => win?.templateRole === role);
  return matches.find(([, win]) => windowHasAgent(win, owner)) || matches[0] || null;
}

/** Push one item onto a list field of a window in a Y.Doc. */
export function appendInDoc(doc, role, field, item, owner = null) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  if (!(windows instanceof Y.Map)) return null;
  const entries = [...windows.entries()]
    .filter(([, win]) => win instanceof Y.Map)
    .map(([id, win]) => [id, { templateRole: win.get('templateRole'), teamAgents: valueFromY(win.get('teamAgents')) }, win]);
  const picked = pickRoleWindow(entries, role, owner);
  if (picked) {
    const [id, , win] = picked;
    const list = win.get(field);
    if (list instanceof Y.Array) {
      list.push([valueToY(item)]);
      if (list.length > MAX_LIST_ITEMS) list.delete(0, list.length - MAX_LIST_ITEMS);
    } else {
      const current = Array.isArray(valueFromY(list)) ? valueFromY(list) : [];
      win.set(field, valueToY([...current, item].slice(-MAX_LIST_ITEMS)));
    }
    return id;
  }
  return null;
}

/**
 * Append `item` to `field` of the board's `role` window. Returns the window
 * id, or null when the board has no such window.
 */
export async function appendToTemplateWindow(db, { workspaceId, role, field, item, owner = null }, { live = transactCanvasDoc } = {}) {
  let liveId = null;
  try {
    await live(workspaceId, (doc) => { liveId = appendInDoc(doc, role, field, item, owner); });
  } catch (error) {
    log.warn('live board append failed', { workspaceId, role, code: safeErrorCode(error) });
  }

  const client = await db.connect();
  let snapshotId = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT value FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [workspaceId, WORKSPACE_STATE_KEY],
    );
    const value = rows[0] ? structuredClone(rows[0].value || {}) : null;
    const windows = Array.isArray(value?.wins) ? value.wins : [];
    const picked = pickRoleWindow(windows.map((win, i) => [i, win]), role, owner);
    const index = picked ? picked[0] : -1;
    if (index !== -1) {
      const current = Array.isArray(windows[index][field]) ? windows[index][field] : [];
      windows[index] = { ...windows[index], [field]: [...current, item].slice(-MAX_LIST_ITEMS), updatedAt: new Date().toISOString() };
      value.wins = windows;
      await client.query(
        `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
         WHERE workspace_id=$1 AND key=$2`,
        [workspaceId, WORKSPACE_STATE_KEY, JSON.stringify(value)],
      );
      snapshotId = windows[index].id;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return liveId || snapshotId;
}
