// Live cursors inside shared text: where each teammate's cursor sits in a
// window's words (a Doc window's text, for a start). Each tab publishes one
// `caret` in its Yjs awareness state: { windowId, field, at }, where `at` is
// a Yjs relative position, so the spot moves with the words around it when
// someone types in front of it, and nobody's words are sent along. Everyone
// else turns it back into a place in the text. No React, no sockets: the
// board's connection (useYjsCanvas.js) hands its doc and awareness in here.
import * as Y from 'yjs';
import { CANVAS_ROOT, isValidId } from '../../../shared/collab/ySchema.js';
import { presenceColor } from './awarenessPresence.js';

let channel = { doc: null, awareness: null };
const listeners = new Set();

/** The live board's doc and awareness (both null while offline). */
export function caretChannel() {
  return channel;
}

/** Called by the board connection when it goes live, and with nulls when it stops. */
export function setCaretChannel(doc = null, awareness = null) {
  if (channel.doc === doc && channel.awareness === awareness) return;
  channel = { doc, awareness };
  for (const fn of listeners) fn(channel);
}

/** Hear when the board connection changes; returns the unsubscribe. */
export function onCaretChannel(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A window's shared words, or null when that field is not shared text. */
export function sharedText(doc, windowId, field) {
  const windows = doc?.getMap(CANVAS_ROOT).get('windows');
  const win = windows instanceof Y.Map ? windows.get(String(windowId)) : null;
  const text = win instanceof Y.Map ? win.get(field) : null;
  return text instanceof Y.Text ? text : null;
}

/** What this tab publishes for a cursor at `index`; null when the words are not shared. */
export function caretState(doc, windowId, field, index) {
  const text = sharedText(doc, windowId, field);
  if (!text || !Number.isInteger(index)) return null;
  const at = Math.max(0, Math.min(index, text.length));
  return { windowId: String(windowId), field, at: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, at)) };
}

/** Publish this tab's cursor in a window's words. */
export function reportTextCaret(windowId, field, index) {
  const { doc, awareness } = channel;
  if (!doc || !awareness) return;
  const next = caretState(doc, windowId, field, index);
  const prev = awareness.getLocalState()?.caret ?? null;
  if (JSON.stringify(prev) !== JSON.stringify(next)) awareness.setLocalStateField('caret', next);
}

/** Take this tab's cursor out of a window's words (it left the box). */
export function clearTextCaret(windowId, field) {
  const { awareness } = channel;
  const prev = awareness?.getLocalState()?.caret;
  if (prev && prev.windowId === String(windowId) && prev.field === field) awareness.setLocalStateField('caret', null);
}

const isId = (v) => v && typeof v === 'object' && Number.isInteger(v.client) && Number.isInteger(v.clock);

// A spot inside the words always points at a letter (`item`) or at the words
// themselves (`type`). A spot that names a top-level type (`tname`) is
// refused: reading it would make that type in this tab's board doc.
function placeOf(doc, text, at) {
  if (!at || typeof at !== 'object' || 'tname' in at) return null;
  if (!isId(at.item) && !isId(at.type)) return null;
  try {
    const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(at), doc);
    return abs && abs.type === text ? abs.index : null;
  } catch {
    return null;
  }
}

/**
 * Everyone else's cursors in one window's words, oldest tab first:
 * [{ clientId, index, name, color }]. A cursor whose spot is gone (the words
 * around it were removed) lands where those words were.
 */
export function readTextCarets(states, selfClientId, doc, windowId, field) {
  const text = sharedText(doc, windowId, field);
  if (!text || !isValidId(windowId)) return [];
  const carets = [];
  for (const [clientId, state] of states || []) {
    const caret = state?.caret;
    if (clientId === selfClientId || !state?.user || !caret) continue;
    if (caret.windowId !== String(windowId) || caret.field !== field) continue;
    const index = placeOf(doc, text, caret.at);
    if (index === null) continue;
    const user = state.user;
    const name = (typeof user.name === 'string' && user.name.trim() ? user.name.trim() : 'Someone').slice(0, 40);
    carets.push({ clientId: String(clientId), index, name, color: presenceColor(user.id || name) });
  }
  return carets;
}

/** True when `doc` is the board connection cursors use right now. */
export function caretChannelIs(doc) {
  return channel.doc === doc;
}
