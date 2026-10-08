// server/collab/serverWriter.js
//
// Server-side writes into the shared canvas CRDT. Agents edit the canvas by
// committing to the revision snapshot (workspace_client_state); mirroring
// those window edits here makes them appear live for every connected
// browser and keeps the Yjs doc — which wins on the next load — complete.

import * as Y from 'yjs';
import { createLogger } from '../logger.js';
import { transactCanvasDoc } from './liveDoc.js';
import { valueFromY, valueToY } from './seedFromSnapshot.js';
import { CANVAS_ROOT, isValidWindowGeometry } from './ySchema.js';
import { WINDOW_TEXT_FIELDS, applyTextDiff, diffText } from './textDiff.js';

const log = createLogger('yjs-server-writer');

function sameValue(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Upsert one window into a Y.Doc, touching only fields that changed. */
export function upsertWindowInDoc(doc, win) {
  if (!isValidWindowGeometry(win)) return false;
  const root = doc.getMap(CANVAS_ROOT);
  let windows = root.get('windows');
  if (!(windows instanceof Y.Map)) {
    windows = new Y.Map();
    root.set('windows', windows);
  }
  const existing = windows.get(String(win.id));
  if (!(existing instanceof Y.Map)) {
    windows.set(String(win.id), valueToY(win));
    return true;
  }
  for (const [field, value] of Object.entries(win)) {
    if (value === undefined || typeof value === 'function') continue;
    const current = existing.get(field);
    if (sameValue(valueFromY(current), value)) continue;
    // An agent rewriting a doc body only touches the span it changed, so a
    // person typing in the same window at that moment keeps their edits.
    if (current instanceof Y.Text && WINDOW_TEXT_FIELDS.has(field) && typeof value === 'string') {
      applyTextDiff(current, diffText(current.toString(), value));
    } else {
      existing.set(field, valueToY(value));
    }
  }
  return true;
}

/** Mirror an agent's committed window into the live canvas doc. Never throws. */
export async function mirrorWindowToCanvas(workspaceId, win) {
  try {
    return await transactCanvasDoc(workspaceId, (doc) => upsertWindowInDoc(doc, win));
  } catch (error) {
    log.warn('canvas CRDT mirror failed', { workspaceId, windowId: win?.id, error: error.message });
    return false;
  }
}
