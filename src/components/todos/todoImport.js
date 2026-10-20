// The To-do List's "Import .todo": each card in the file becomes one to-do,
// already assigned to whoever its "For:" line names, and keeps its steps so
// "Steps" can open it as a stack of step cards (src/components/windows/stepCards/).

import { logToApp } from '../../lib/appLog/browserLog.js';
import { newId } from '../../lib/ids/newId.js';
import { parseTodoFile } from '../../lib/stepCards/todoFile.js';
import { makeCard } from '../../lib/stepCards/stack.js';
import { useWorkspaceStore } from '../../lib/store.js';

/** { title, items, skipped } from a .todo file's text. Throws a plain-words error when it has no cards. */
export function todoItemsFrom(text, makeId = newId) {
  const parsed = parseTodoFile(text);
  if (!parsed.cards.length) throw new Error('That .todo file has no cards with steps in it.');
  const items = parsed.cards.map((card) => ({
    id: makeId(),
    text: card.title,
    done: false,
    assignee: card.assignee || null,
    assigneeName: null,
    card,
  }));
  logToApp('info', `todos: imported a .todo file (${items.length} to-dos)`, { where: 'todos' });
  return { title: parsed.title, items, skipped: parsed.skipped };
}

/**
 * Open one imported to-do's steps in a Step cards window next to the list, or bring
 * back the one already open for it, so its progress is never split in two.
 * Returns the window id to save on the to-do as stepsWindowId.
 */
export function openSteps(item, listWin, store = useWorkspaceStore) {
  if (!item?.card) return null;
  const state = store.getState();
  if (item.stepsWindowId && state.wins.some((w) => w.id === item.stepsWindowId)) {
    state.setActiveId(item.stepsWindowId);
    return item.stepsWindowId;
  }
  const card = { ...makeCard(item.card, newId), assignee: item.assignee || null, assigneeName: item.assigneeName || null };
  const pos = Number.isFinite(listWin?.x) ? { x: listWin.x + (listWin.w || 320) + 24, y: listWin.y || 0 } : null;
  logToApp('info', 'todos: opened a to-do as step cards', { where: 'todos' });
  return state.spawnAt('stepCards', { title: item.text, cards: [card], selectedCardId: card.id }, pos);
}
