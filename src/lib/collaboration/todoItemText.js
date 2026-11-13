// A To-do list keeps its to-dos in `items`, each with its words in `text`.
// To-dos already merged one by one (windowLists.js), but a to-do's words
// were swapped whole, so when Pat and Sam fixed the words of the same to-do
// at once, the last one to type wiped out the other's letters. Now each
// to-do's words are a Y.Text, so two people typing in one to-do merge letter
// by letter. Pure: no sockets.
import * as Y from 'yjs';
import { valueToY } from '../../../shared/collab/seedFromSnapshot.js';
import { applyTextDiff, diffText } from '../../../shared/collab/textDiff.js';
import { editRecord, mapOf } from './stepCardText.js';
import { writeWindowList } from './windowLists.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWords = (key, value) => key === 'text' && typeof value === 'string';

/** One to-do as a shared map, its words ready to merge. */
export function todoToY(item) {
  if (!isRecord(item)) return valueToY(item);
  return mapOf(item, (key, value) => (isWords(key, value) ? new Y.Text(value) : valueToY(value)));
}

// Words saved as plain text before this become a Y.Text on their first edit.
function writeTodoPart(map, key, _prev, value) {
  if (!isWords(key, value)) return false;
  const live = map.get(key);
  if (live instanceof Y.Text) applyTextDiff(live, diffText(live.toString(), value));
  else map.set(key, new Y.Text(value));
  return true;
}

const TODOS = { edit: (map, prev, next) => editRecord(map, prev, next, writeTodoPart), toY: todoToY };

/**
 * Write a To-do list's `items` to-do by to-do, letter by letter. A list that
 * can't be merged (no shared copy yet, or reordered) is written whole, its
 * words ready to merge from the start. False when the value is not a list.
 */
export function writeTodoItems(target, prevValue, nextValue) {
  if (!Array.isArray(nextValue)) return false;
  if (writeWindowList(target, 'items', prevValue, nextValue, TODOS)) return true;
  const arr = new Y.Array();
  arr.push(nextValue.map(todoToY));
  target.set('items', arr);
  return true;
}
