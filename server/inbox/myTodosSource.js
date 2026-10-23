// To-dos someone assigned to you ("Me" in a To-do window's Assign menu), one
// Inbox line each, on every board you belong to. Nothing to fix: tick it off
// in its To-do window.

import { registerInboxSource } from './sources.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('my-todos');

let lister = async (ctx) => {
  const [{ default: pool }, { listMyTodos }] = await Promise.all([import('../db.js'), import('../todos/mine.js')]);
  return listMyTodos(pool, ctx);
};
export function setMyTodosLister(fn) { lister = fn; }

export async function myTodos(ctx) {
  try {
    return await lister(ctx);
  } catch (err) {
    log.warn('could not list to-dos assigned to this person', { userId: ctx?.userId, code: safeErrorCode(err) });
    throw err;
  }
}

/** One assigned to-do as an Inbox report. */
export function myTodoReport(todo) {
  return {
    id: `${todo.boardId}:${todo.windowId}:${todo.itemId}`,
    todo: true,
    title: todo.text,
    detail: `${todo.listTitle} on ${todo.boardName}`,
    boardId: todo.boardId,
    listTitle: todo.listTitle,
    windowId: todo.windowId,
    itemId: todo.itemId,
    count: 1,
    lastHour: null,
    firstSeen: todo.updatedAt,
    lastSeen: todo.updatedAt,
    repo: todo.boardName,
    fixable: false,
  };
}

export function registerMyTodosSource() {
  return registerInboxSource('my-todos', {
    async list({ userId }) {
      if (!userId) return [];
      return (await myTodos({ userId })).map(myTodoReport);
    },
  });
}
