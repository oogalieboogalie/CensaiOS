// To-dos assigned to one person ("Me" in a To-do window's Assign menu) on
// every board they belong to. Read from each board's saved copy
// (workspace_client_state, refreshed from the live board as it changes), so
// the bottom-bar reminder and the Inbox can list them without opening each
// board.

import { openTodosFor } from '../../src/lib/todos/assignees.js';
import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';

export const MY_TODOS_LIMIT = 100;

/** [{ boardId, boardName, windowId, listTitle, itemId, text, updatedAt }] newest board first. */
export async function listMyTodos(db, { userId, limit = MY_TODOS_LIMIT }) {
  if (userId == null) return [];
  const { rows } = await db.query(
    `SELECT w.id AS board_id, w.name AS board_name, s.updated_at, win
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       JOIN workspace_client_state s ON s.workspace_id = w.id AND s.key = $2
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(s.value->'wins') = 'array' THEN s.value->'wins' ELSE '[]'::jsonb END
       ) AS win
      WHERE wm.user_id = $1 AND (win->>'kind' = 'todos' OR win->>'type' = 'todos')
      ORDER BY s.updated_at DESC`,
    [userId, WORKSPACE_STATE_KEY],
  );
  const out = [];
  for (const row of rows) {
    for (const todo of openTodosFor([row.win], userId)) {
      out.push({
        ...todo,
        boardId: row.board_id,
        boardName: row.board_name || 'Untitled board',
        updatedAt: new Date(row.updated_at || Date.now()).toISOString(),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
