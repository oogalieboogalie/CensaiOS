// Minimal single-span text diff plus caret rebasing. Used to turn "the
// editor's text went from A to B" into one Y.Text delete+insert (so two people
// typing in different places of the same document both keep their edits), and
// to keep a local caret in place when someone else's edit lands. Pure; shared
// by the browser binding and the server-side agent writer.

/** Window fields stored as Y.Text so concurrent typing merges. */
export const WINDOW_TEXT_FIELDS = new Set(['text', 'code']);

/** Vault notes keep each note's words in a field of its own, `vt.<noteId>`. */
export const NOTE_TEXT_PREFIX = 'vt.';

/** True for a window field whose words merge as people type (a Y.Text). */
export function isWindowTextField(field) {
  return WINDOW_TEXT_FIELDS.has(field) || (typeof field === 'string' && field.startsWith(NOTE_TEXT_PREFIX));
}

/** One contiguous change turning `a` into `b`: { index, remove, insert }. */
export function diffText(a, b) {
  const before = String(a ?? '');
  const after = String(b ?? '');
  if (before === after) return { index: 0, remove: 0, insert: '' };
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let end = 0;
  while (end < max - start
    && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end += 1;
  return { index: start, remove: before.length - start - end, insert: after.slice(start, after.length - end) };
}

/**
 * Like diffText, but when the change is one plain insert or delete that fits
 * at `index` (where the caret says it happened), use that spot. In repeated
 * letters ("aa" -> "aaa") several spots give the same text; the caret knows
 * which one the person meant.
 */
export function diffTextAt(a, b, index) {
  const before = String(a ?? '');
  const after = String(b ?? '');
  const grow = after.length - before.length;
  if (Number.isInteger(index) && index >= 0 && grow !== 0) {
    const n = Math.abs(grow);
    const [long, short] = grow > 0 ? [after, before] : [before, after];
    if (index + n <= long.length && long.slice(0, index) === short.slice(0, index)
      && long.slice(index + n) === short.slice(index)) {
      return grow > 0 ? { index, remove: 0, insert: after.slice(index, index + n) } : { index, remove: n, insert: '' };
    }
  }
  return diffText(before, after);
}

/** The text after applying `op` to `text`. */
export function applyOp(text, op) {
  return text.slice(0, op.index) + op.insert + text.slice(op.index + op.remove);
}

/** Apply a diff to a Y.Text (caller wraps it in a transaction). */
export function applyTextDiff(ytext, op) {
  if (op.remove) ytext.delete(op.index, op.remove);
  if (op.insert) ytext.insert(op.index, op.insert);
}

/** Where a caret at `pos` ends up after `op` was applied by someone else. */
export function rebaseCaret(pos, op) {
  if (pos <= op.index) return pos;
  if (pos >= op.index + op.remove) return pos - op.remove + op.insert.length;
  return op.index + op.insert.length;
}

/** rebaseCaret through several edits, in the order they happened. */
export function rebaseThrough(pos, ops) {
  return ops.reduce((at, op) => rebaseCaret(at, op), pos);
}

/**
 * Replay a local edit (base -> next) onto `latest`, the shared text as it is
 * right now. An editor can be one render behind the shared text when someone
 * else's change lands mid-keystroke; diffing its whole value would then undo
 * that change. Replaying only the span the person typed keeps both.
 */
export function mergeLocalEdit(base, next, latest, opts) {
  return mergeLocalEditOp(base, next, latest, opts).text;
}

/**
 * mergeLocalEdit plus the edit it made, as an op on `latest`. `caret` is
 * where the person's caret ended up (it pins the typed span in repeated
 * letters); `theirs` are the other people's edits from base to latest as the
 * shared doc reported them (without them, a diff guesses where they went).
 */
export function mergeLocalEditOp(base, next, latest, { caret = null, theirs = null } = {}) {
  const from = String(base ?? '');
  const to = String(next ?? '');
  const at = Number.isInteger(caret) ? (to.length >= from.length ? caret - (to.length - from.length) : caret) : null;
  const mine = diffTextAt(from, to, at);
  if (typeof latest !== 'string' || latest === from) return { text: to, op: mine };
  const ops = theirs || [diffText(from, latest)];
  const start = rebaseThrough(mine.index, ops);
  const end = Math.max(start, mine.remove ? rebaseThrough(mine.index + mine.remove, ops) : start);
  const op = { index: start, remove: end - start, insert: mine.insert };
  return { text: applyOp(latest, op), op };
}
