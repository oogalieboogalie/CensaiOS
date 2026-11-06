// An unsaved copy of shared text that someone edits on their own and puts on
// the board later (a CAD recipe is edited this way, then Run). Before, when
// Sam ran his change while Pat still had unsaved edits, Pat's copy kept the
// old recipe, and Pat's Run wiped Sam's change. Now Pat's copy is a small
// private Yjs document: her keystrokes go in as they happen, and each change
// that reaches the board is merged in the same way two people typing merge,
// so her copy shows Sam's change and her Run keeps it. Pure: no sockets.
import * as Y from 'yjs';
import { applyTextDiff, diffText, diffTextAt } from '../../../shared/collab/textDiff.js';

const FIELD = 'draft';

const forkAt = (update) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
};

/** Start a private copy of `base`, the text as it is on the board now. */
export function startDraft(base) {
  const doc = new Y.Doc();
  doc.getText(FIELD).insert(0, String(base ?? ''));
  return { doc, board: String(base ?? ''), boardUpdate: Y.encodeStateAsUpdate(doc) };
}

/** The copy's words right now. */
export const draftValue = (draft) => draft.doc.getText(FIELD).toString();

/** Record my own edit to the copy; `caret` is where my caret ended up. */
export function typeInDraft(draft, next, caret = null) {
  const text = draft.doc.getText(FIELD);
  const before = text.toString();
  const to = String(next ?? '');
  if (before === to) return to;
  const at = Number.isInteger(caret) && to.length > before.length ? caret - (to.length - before.length) : caret;
  draft.doc.transact(() => applyTextDiff(text, diffTextAt(before, to, at)));
  return text.toString();
}

/**
 * The board's text changed from what this copy started from (or last saw)
 * to `board`. Merge that change into the copy and return the copy's words.
 * `theirs` are the board's own ops for the change, when known.
 */
export function rebaseDraft(draft, board, theirs = null) {
  const next = String(board ?? '');
  if (next === draft.board) return draftValue(draft);
  const other = forkAt(draft.boardUpdate);
  const text = other.getText(FIELD);
  other.transact(() => {
    for (const op of theirs || [diffText(draft.board, next)]) applyTextDiff(text, op);
  });
  if (text.toString() !== next) {
    // The ops did not add up to the board's text: fall back to one diff.
    const fixed = forkAt(draft.boardUpdate);
    fixed.transact(() => applyTextDiff(fixed.getText(FIELD), diffText(draft.board, next)));
    return adopt(draft, fixed, next);
  }
  return adopt(draft, other, next);
}

function adopt(draft, other, board) {
  const update = Y.encodeStateAsUpdate(other);
  Y.applyUpdate(draft.doc, update);
  draft.board = board;
  draft.boardUpdate = update;
  return draftValue(draft);
}
