// Server writes to a module window an agent opened: build progress while the
// model writes, then the finished module (or the error). Progress goes only
// to the live canvas doc; the finished state is committed to the revisioned
// snapshot as well, so a board opened later still has it.

import * as Y from 'yjs';
import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { createLogger } from '../logger.js';

const log = createLogger('modules');

/** Set only the given fields on a window that exists in the doc. */
export function patchWindowInDoc(doc, windowId, patch) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  if (!(windows instanceof Y.Map)) return false;
  const existing = windows.get(String(windowId));
  if (!(existing instanceof Y.Map)) return false;
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) existing.delete(field);
    else existing.set(field, valueToY(value));
  }
  return true;
}

export async function patchLiveModuleWindow(workspaceId, windowId, patch) {
  try {
    return await transactCanvasDoc(workspaceId, (doc) => patchWindowInDoc(doc, windowId, patch));
  } catch (error) {
    log.warn('module window live patch failed', { workspaceId, windowId, error: error.message });
    return false;
  }
}

/** Commit a patch to the snapshot and the live doc, and tell open boards. */
export async function commitModuleWindow(db, { workspaceId, windowId, patch, actor }) {
  const client = await db.connect();
  let committed = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT value FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [workspaceId, WORKSPACE_STATE_KEY],
    );
    const value = rows[0] ? structuredClone(rows[0].value || {}) : null;
    const windows = Array.isArray(value?.wins) ? value.wins : [];
    const index = windows.findIndex(win => win.id === windowId);
    if (index !== -1) {
      const now = new Date().toISOString();
      windows[index] = { ...windows[index], ...patch, updatedAt: now };
      value.wins = windows;
      value.updatedAt = now;
      const updated = await client.query(
        `UPDATE workspace_client_state SET value=$3,revision=revision+1,updated_at=NOW()
         WHERE workspace_id=$1 AND key=$2 RETURNING revision`,
        [workspaceId, WORKSPACE_STATE_KEY, JSON.stringify(value)],
      );
      committed = { revision: Number(updated.rows[0].revision), value, window: windows[index] };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await patchLiveModuleWindow(workspaceId, windowId, patch);
  if (committed) {
    publishWorkspaceEvent(workspaceId, {
      type: 'workspace.committed',
      workspaceId,
      revision: committed.revision,
      value: committed.value,
      sourceClientId: null,
      actor,
      activity: { kind: 'canvas.window.updated', windowId, label: `${actor?.label || 'Agent'} built ${committed.window.title || 'a module'}` },
    });
  }
  return committed;
}
