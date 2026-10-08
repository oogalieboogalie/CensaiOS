// Minimal single-span text diff plus caret rebasing. Used to turn "the
// editor's text went from A to B" into one Y.Text delete+insert (so two people
// typing in different places of the same document both keep their edits), and
// to keep a local caret in place when someone else's edit lands. Pure; shared
// by the browser binding and the server-side agent writer.

/** Window fields stored as Y.Text so concurrent typing merges. */
export const WINDOW_TEXT_FIELDS = new Set(['text', 'code']);

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

/**
 * Replay a local edit (base -> next) onto `latest`, the shared text as it is
 * right now. An editor can be one render behind the shared text when someone
 * else's change lands mid-keystroke; diffing its whole value would then undo
 * that change. Replaying only the span the person typed keeps both.
 */
export function mergeLocalEdit(base, next, latest) {
  if (typeof latest !== 'string' || latest === base) return next;
  const mine = diffText(base, next);
  const theirs = diffText(base, latest);
  const start = rebaseCaret(mine.index, theirs);
  const end = Math.max(start, mine.remove ? rebaseCaret(mine.index + mine.remove, theirs) : start);
  return latest.slice(0, start) + mine.insert + latest.slice(end);
}
