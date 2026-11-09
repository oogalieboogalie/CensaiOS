// Shared board updates must not start a run on someone else's computer.
// A member or an edit-link guest can edit the board. They must not be able
// to plant agentRun / launchCli (the terminal reads those and starts
// OpenCode or a coding CLI) unless the writer is the board owner.
// autoSend is never shared: each browser decides for itself whether to send.
import * as Y from 'yjs';
import { CANVAS_ROOT } from './ySchema.js';
import { valueFromY, valueToY } from './seedFromSnapshot.js';

export const AUTO_RUN_FIELDS = Object.freeze(['agentRun', 'launchCli']);
export const NEVER_SYNC_FIELDS = Object.freeze(['autoSend', 'autoSendBy']);

const RESTORE_ORIGIN = Object.freeze({ source: 'auto-run-guard' });
const guarded = new WeakSet();
const snaps = new WeakMap();

function contextFromOrigin(origin) {
  if (!origin || typeof origin !== 'object') return null;
  if (origin.source === 'connection') return origin.connection?.context || null;
  if (origin.source === 'local') return origin.context || null;
  return null;
}

/** True only for the board owner's own connection. Guests and members are not. */
export function allowsAutoRun(origin) {
  const context = contextFromOrigin(origin);
  if (!context?.userId || context.guestId) return false;
  return context.workspace?.role === 'owner';
}

function same(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function fieldsFor(allowAutoRun) {
  return allowAutoRun ? NEVER_SYNC_FIELDS : [...AUTO_RUN_FIELDS, ...NEVER_SYNC_FIELDS];
}

function snapshot(doc) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  const out = new Map();
  if (!(windows instanceof Y.Map)) return out;
  windows.forEach((win, id) => {
    if (!(win instanceof Y.Map)) return;
    const kept = {};
    for (const field of [...AUTO_RUN_FIELDS, ...NEVER_SYNC_FIELDS]) {
      if (win.has(field)) kept[field] = valueFromY(win.get(field));
    }
    if (Object.keys(kept).length) out.set(String(id), kept);
  });
  return out;
}

function needsRevert(doc, before, allowAutoRun) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  if (!(windows instanceof Y.Map)) return false;
  for (const [id, win] of windows.entries()) {
    if (!(win instanceof Y.Map)) continue;
    const prev = before.get(String(id)) || {};
    for (const field of fieldsFor(allowAutoRun)) {
      const now = win.has(field) ? valueFromY(win.get(field)) : undefined;
      const was = Object.prototype.hasOwnProperty.call(prev, field) ? prev[field] : undefined;
      if (!same(now, was)) return true;
    }
  }
  return false;
}

function revert(doc, before, allowAutoRun) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  if (!(windows instanceof Y.Map)) return;
  for (const [id, win] of [...windows.entries()]) {
    if (!(win instanceof Y.Map)) continue;
    const prev = before.get(String(id)) || {};
    for (const field of fieldsFor(allowAutoRun)) {
      const now = win.has(field) ? valueFromY(win.get(field)) : undefined;
      const was = Object.prototype.hasOwnProperty.call(prev, field) ? prev[field] : undefined;
      if (same(now, was)) continue;
      if (was === undefined) win.delete(field);
      else win.set(field, valueToY(was));
    }
  }
}

function skip(origin) {
  return origin === RESTORE_ORIGIN || origin?.source === 'redis';
}

/** Drop untrusted auto-run fields after every transaction on this doc. */
export function installAutoRunGuard(doc) {
  if (!doc || guarded.has(doc)) return;
  guarded.add(doc);
  doc.on('beforeTransaction', (transaction) => {
    if (skip(transaction.origin)) return;
    snaps.set(transaction, snapshot(doc));
  });
  doc.on('afterTransaction', (transaction) => {
    if (skip(transaction.origin)) return;
    const before = snaps.get(transaction);
    snaps.delete(transaction);
    if (!before) return;
    const allow = allowsAutoRun(transaction.origin);
    if (!needsRevert(doc, before, allow)) return;
    doc.transact(() => { revert(doc, before, allow); }, RESTORE_ORIGIN);
  });
}

export function autoRunGuardExtension() {
  return {
    async onLoadDocument({ document }) {
      installAutoRunGuard(document);
    },
  };
}
