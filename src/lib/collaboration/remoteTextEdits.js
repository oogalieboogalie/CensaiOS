import * as Y from 'yjs';
import { applyOp, isWindowTextField } from '../../../shared/collab/textDiff.js';

// Where other people's typing actually landed in a window's text, as the
// shared doc reported it. Guessing that from two strings fails in repeated
// words: with "Made-up list: " typed by two people at once, a diff cannot
// tell whose copy is whose, the caret jumps, and the next letter lands in
// the wrong place. The editor asks here first and only guesses when this has
// no record. Also holds this tab's own last typed edit so the write into the
// shared doc uses the same spot the caret did.

const MAX_STEPS = 20;
const steps = new Map(); // key -> [{ before, after, ops }]
const pending = new Map(); // key -> ops seen in the remote change being applied
const localEdits = new Map(); // key -> { text, op }

const keyOf = (id, field) => `${id}\u0000${field}`;

/** A Y.Text change as ops on the text as it was: { index, remove, insert }. */
export function opsFromDelta(delta) {
  const ops = [];
  let index = 0;
  for (const part of delta) {
    if (part.retain) index += part.retain;
    else if (part.delete) ops.push({ index, remove: part.delete, insert: '' });
    else if (typeof part.insert === 'string') {
      ops.push({ index, remove: 0, insert: part.insert });
      index += part.insert.length;
    }
  }
  return ops;
}

/** observeDeep callback on the canvas root: keep the ops of remote text changes. */
export function collectTextEvents(events, isLocal) {
  if (isLocal) return;
  for (const event of events) {
    if (!(event.target instanceof Y.Text)) continue;
    const [where, id, field] = event.path.length === 2 ? [...event.path, event.target._item?.parentSub] : event.path;
    if (where !== 'windows' || !isWindowTextField(field)) continue;
    const key = keyOf(id, field);
    pending.set(key, [...(pending.get(key) || []), ...opsFromDelta(event.delta)]);
  }
}

/** After a remote change reached the store: pair each window's old and new text with its ops. */
export function recordRemoteText(prevWins = [], nextWins = []) {
  const before = new Map(prevWins.map((w) => [String(w?.id), w]));
  const after = new Map(nextWins.map((w) => [String(w?.id), w]));
  for (const [key, ops] of pending) {
    const [id, field] = key.split('\u0000');
    const from = before.get(id)?.[field];
    const to = after.get(id)?.[field];
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    if (ops.reduce(applyOp, from) !== to) continue;
    const list = steps.get(key) || [];
    list.push({ before: from, after: to, ops });
    if (list.length > MAX_STEPS) list.shift();
    steps.set(key, list);
  }
  pending.clear();
}

/** The other people's ops that turned `from` into `to`, or null when unknown. */
export function remoteOps(id, field, from, to) {
  if (from === to) return [];
  const list = steps.get(keyOf(id, field)) || [];
  const ops = [];
  let at = from;
  for (let guard = 0; guard < list.length; guard += 1) {
    const step = [...list].reverse().find((s) => s.before === at);
    if (!step) return null;
    ops.push(...step.ops);
    at = step.after;
    if (at === to) return ops;
  }
  return null;
}

export function noteLocalEdit(id, field, text, op) {
  localEdits.set(keyOf(id, field), { text, op });
}

/** The op this tab just typed, when `text` is still what it produced. */
export function takeLocalEdit(id, field, text) {
  const key = keyOf(id, field);
  const edit = localEdits.get(key);
  localEdits.delete(key);
  return edit && edit.text === text ? edit.op : null;
}

export function resetTextEdits() {
  steps.clear();
  pending.clear();
  localEdits.clear();
}
