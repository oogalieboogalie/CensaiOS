import { useWorkspaceStore } from '../store.js';
import { raiseWindow } from '../windowStacking.js';
import { workspaceShareLink } from '../workspace/shareLink.js';
import { updateOperationalTodo } from '../api/operationalIntelligence.js';
import { logToApp } from '../appLog/browserLog.js';
import { normalizeTodos } from '../../components/todos/TodosData.js';

// What the Inbox and the bottom-bar "For you" list can do with a to-do
// assigned to you: go to its To-do window (or its board), and tick it off.
// A to-do is { boardId, windowId, itemId, text }, with its board's name
// (boardName, or repo on an Inbox line) and listTitle when known.
//
// Every Mark done and Open writes one app-log line under 'todos': the board,
// the list, the item id, and whether it worked or why not. Never the to-do's
// own words.

const sameId = (a, b) => String(a) === String(b);

function todoWindow(todo) {
  const { wins, workspaceId } = useWorkspaceStore.getState();
  if (!todo?.boardId || !sameId(todo.boardId, workspaceId)) return null;
  return wins.find((w) => sameId(w.id, todo.windowId)) || null;
}

function logAction(level, action, from, outcome, todo, win) {
  const board = todo?.boardName || todo?.repo || todo?.boardId || 'this board';
  const list = win ? win.title || 'To-do List' : todo?.listTitle || 'its list';
  logToApp(level, `todos: ${action} from ${from} ${outcome} (board "${board}", list "${list}", item ${todo?.itemId ?? 'unknown'})`, { where: 'todos' });
}

/** True when the to-do's list is on the board you have open. */
export function isTodoHere(todo) {
  return Boolean(todoWindow(todo));
}

/** Centre the to-do's list on this board, or open the board it is on. */
export function goToTodo(todo, { assign = (url) => window.location.assign(url), from = 'the Inbox' } = {}) {
  const win = todoWindow(todo);
  if (!win) {
    const link = workspaceShareLink(todo?.boardId);
    if (!link) {
      logAction('warn', 'Open', from, 'did not work: no link to its board', todo, null);
      return false;
    }
    logAction('info', 'Open', from, 'worked: opening its board', todo, null);
    assign(link);
    return true;
  }
  const { zoom, setActiveId, setWins, setPan } = useWorkspaceStore.getState();
  setActiveId(win.id);
  setWins((list) => raiseWindow(list, win.id));
  const cx = (Number(win.x) || 0) + (Number(win.w) || 0) / 2;
  const cy = (Number(win.y) || 0) + (Number(win.h) || 0) / 2;
  setPan({ x: window.innerWidth / 2 - cx * zoom, y: window.innerHeight / 2 - cy * zoom });
  logAction('info', 'Open', from, 'worked: its list is in view', todo, win);
  return true;
}

/**
 * Tick the to-do in its To-do window. Only on the board you have open, so
 * everyone on that board sees the tick the way a click in the list would.
 * Returns { ok, why }.
 */
export function markTodoDone(todo, { saveOperational = updateOperationalTodo, from = 'the Inbox' } = {}) {
  const win = todoWindow(todo);
  if (!win) {
    logAction('info', 'Mark done', from, 'did not work: its list is not on the board you have open', todo, null);
    return { ok: false, why: 'Open its board to tick it off there.' };
  }
  const items = normalizeTodos(win.items);
  const item = items.find((it) => sameId(it.id, todo.itemId));
  if (!item) {
    logAction('warn', 'Mark done', from, 'did not work: the to-do is no longer in its list', todo, win);
    return { ok: false, why: 'This to-do is no longer in its list.' };
  }
  if (item.done) {
    logAction('info', 'Mark done', from, 'worked: it was already ticked', todo, win);
    return { ok: true };
  }
  useWorkspaceStore.getState().onUpdate(win.id, { items: items.map((it) => (it === item ? { ...it, done: true } : it)) });
  if (!win.artifactId) {
    logAction('info', 'Mark done', from, 'worked', todo, win);
    return { ok: true };
  }
  // A list kept on the server: its one line waits for the save.
  const { workspaceId } = useWorkspaceStore.getState();
  Promise.resolve(saveOperational({ workspaceId, listArtifactId: win.artifactId, itemArtifactId: item.id, patch: { done: true } })).then(
    () => logAction('info', 'Mark done', from, 'worked', todo, win),
    (err) => logAction('warn', 'Mark done', from, `ticked it here, but the server did not save it: ${err?.message || err}`, todo, win),
  );
  return { ok: true };
}
