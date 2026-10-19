import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { openTodosFor } from '../../lib/todos/assignees.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

// To-dos assigned to me ("Me" in a To-do window's Assign menu): this board's
// straight from its windows, every other board's from GET /api/inbox/my-todos
// (server/todos/mine.js), checked once a minute and when the app comes back
// into view.

const POLL_MS = 60_000;

export function useMyTodos(me, { fetchImpl = typeof fetch === 'undefined' ? null : fetch } = {}) {
  const wins = useWorkspaceStore((s) => s.wins);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const [elsewhere, setElsewhere] = React.useState([]);
  const meId = me?.id ?? null;
  const failing = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (meId == null || !fetchImpl) return;
    try {
      const res = await fetchImpl('/api/inbox/my-todos', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setElsewhere(Array.isArray(body?.todos) ? body.todos : []);
      failing.current = false;
    } catch (err) {
      // Once per outage, not once a minute.
      if (failing.current) return;
      failing.current = true;
      logToApp('warn', `todos: could not check to-dos assigned to you on other boards: ${err.message}`, { where: 'todos' });
    }
  }, [meId, fetchImpl]);

  React.useEffect(() => {
    if (meId == null) return undefined;
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [meId, refresh]);

  return React.useMemo(() => {
    const here = openTodosFor(wins, meId).map((t) => ({ ...t, boardId: workspaceId, here: true }));
    const others = elsewhere.filter((t) => t.boardId !== workspaceId).map((t) => ({ ...t, here: false }));
    return { here, others, count: here.length + others.length, refresh };
  }, [wins, meId, workspaceId, elsewhere, refresh]);
}
