// An Outbox window keeps the client emails and texts agents drafted in
// `drafts`, each with a subject and a message (`body`). Before, a person's
// rewrite stayed on their own screen until they clicked Save, and then the
// whole list was saved as one piece, so when Pat fixed one draft while Sam
// approved another (or both rewrote the same message), the last one to save
// wiped out the other's change. Now drafts change one by one (windowLists.js)
// and each draft's subject and message are a Y.Text, so two people typing in
// the same message merge letter by letter. Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { editRecord, mapOf } from './stepCardText.js';
import { writeWindowList } from './windowLists.js';

/** The words people write in an Outbox draft. */
export const OUTBOX_WORD_KEYS = new Set(['subject', 'body']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWords = (key, value) => OUTBOX_WORD_KEYS.has(key) && typeof value === 'string';

/** One draft as a shared map, its words ready to merge. */
export function outboxDraftToY(draft) {
  if (!isRecord(draft)) return valueToY(draft);
  return mapOf(draft, (key, value) => (isWords(key, value) ? new Y.Text(value) : valueToY(value)));
}

// Words saved as plain text before this become a Y.Text on their first edit.
function writeDraftPart(map, key, _prev, value) {
  if (!isWords(key, value)) return false;
  const live = map.get(key);
  if (live instanceof Y.Text) applyTextDiff(live, diffText(live.toString(), value));
  else map.set(key, new Y.Text(value));
  return true;
}

const DRAFTS = { edit: (map, prev, next) => editRecord(map, prev, next, writeDraftPart), toY: outboxDraftToY };

/**
 * Write an Outbox's `drafts` draft by draft, letter by letter. A list that
 * can't be merged (no shared copy yet, drafts without ids, or reordered) is
 * written whole, its words ready to merge from the start. False when the
 * value is not a list.
 */
export function writeOutboxDrafts(target, prevValue, nextValue) {
  if (!Array.isArray(nextValue)) return false;
  if (writeWindowList(target, 'drafts', prevValue, nextValue, DRAFTS)) return true;
  const arr = new Y.Array();
  arr.push(nextValue.map(outboxDraftToY));
  target.set('drafts', arr);
  return true;
}
