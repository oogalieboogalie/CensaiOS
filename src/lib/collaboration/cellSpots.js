// Live cursors in a board Spreadsheet: which cell each teammate is typing in.
// A cell's words are not shared text (a cell is saved whole when you finish
// it, see windowSheet.js), so a letter-level cursor has nothing to point at.
// Instead each tab publishes one `cell` in its Yjs awareness state:
// { windowId, rowId, colId }. Rows and columns keep their ids when others
// are added, removed or moved, so the spot stays on the same cell. Only the
// spot goes out, never what is typed. No React, no sockets: the board's
// connection hands its awareness in through textCarets.js.
import { isValidId } from '../../../shared/collab/ySchema.js';
import { presenceColor } from './awarenessPresence.js';
import { caretChannel } from './textCarets.js';

const PART = /^[a-zA-Z0-9._:-]{1,96}$/;
const isPart = (value) => typeof value === 'string' && PART.test(value);

/** The key a cell is found under: "<rowId>:<colId>". */
export const cellKey = (rowId, colId) => `${rowId}:${colId}`;

/** What this tab publishes while typing in a cell; null for a cell that can't be named. */
export function cellSpotState(windowId, rowId, colId) {
  if (!isValidId(windowId) || !isPart(rowId) || !isPart(colId)) return null;
  return { windowId: String(windowId), rowId, colId };
}

/** Publish the cell this tab is typing in. */
export function reportCellSpot(windowId, rowId, colId) {
  const { awareness } = caretChannel();
  if (!awareness) return;
  const next = cellSpotState(windowId, rowId, colId);
  const prev = awareness.getLocalState()?.cell ?? null;
  if (JSON.stringify(prev) !== JSON.stringify(next)) awareness.setLocalStateField('cell', next);
}

/** Take this tab out of a sheet's cells (it stopped typing, or closed the sheet). */
export function clearCellSpot(windowId) {
  const { awareness } = caretChannel();
  const prev = awareness?.getLocalState()?.cell;
  if (prev && prev.windowId === String(windowId)) awareness.setLocalStateField('cell', null);
}

/**
 * Everyone else typing in one sheet, by cell, oldest tab first:
 * Map("<rowId>:<colId>" -> [{ clientId, name, color }]). A teammate without
 * a name shows as "Someone"; one without a user (not signed in) is left out.
 */
export function readCellSpots(states, selfClientId, windowId) {
  const out = new Map();
  if (!isValidId(windowId)) return out;
  for (const [clientId, state] of states || []) {
    const cell = state?.cell;
    if (clientId === selfClientId || !state?.user || !cell) continue;
    if (cell.windowId !== String(windowId) || !isPart(cell.rowId) || !isPart(cell.colId)) continue;
    const user = state.user;
    const name = (typeof user.name === 'string' && user.name.trim() ? user.name.trim() : 'Someone').slice(0, 40);
    const key = cellKey(cell.rowId, cell.colId);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ clientId: String(clientId), name, color: presenceColor(user.id || name) });
  }
  return out;
}
