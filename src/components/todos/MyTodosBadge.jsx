import React from 'react';
import { goToTodo } from '../../lib/todos/todoActions.js';
import { GLASS_HOST, glossContainer } from '../../lib/theme/gloss.js';
import { Icon } from '../Icons.jsx';
import { useMe } from './useMe.js';
import { useMyTodos } from './useMyTodos.js';

// The bottom-bar reminder: a small count beside the Tools pill of the to-dos
// assigned to you ("Me" in a To-do window's Assign menu) on every board you
// are on. Click it for the list; click a to-do to go to its list. Hidden when
// nothing is waiting on you.

const TOOLS_PILL = '[data-testid="dock-capsule-mini"]';

function useBesideToolsPill(active) {
  const [spot, setSpot] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!active) return undefined;
    const place = () => {
      const pill = document.querySelector(TOOLS_PILL);
      if (!pill) return setSpot(null);
      const r = pill.getBoundingClientRect();
      setSpot({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom), height: r.height });
    };
    place();
    const pill = document.querySelector(TOOLS_PILL);
    const observer = typeof ResizeObserver === 'undefined' || !pill ? null : new ResizeObserver(place);
    observer?.observe(pill);
    window.addEventListener('resize', place);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); };
  }, [active]);
  return spot;
}

function goToList(todo, close) {
  close();
  goToTodo(todo, { from: 'the For you list' });
}

function TodoLine({ todo, onGo }) {
  return (
    <button type="button" className="hb-mytodos-row" onClick={() => onGo(todo)} title={todo.here ? 'Go to this list' : `Open ${todo.boardName}`}>
      <span className="hb-mytodos-box" aria-hidden="true" />
      <span className="hb-mytodos-row-text">
        <span className="hb-mytodos-row-title">{todo.text}</span>
        <span className="hb-mytodos-row-sub">{todo.listTitle}{todo.here ? '' : ` · ${todo.boardName}`}</span>
      </span>
    </button>
  );
}

export function MyTodosBadge({ focusMode }) {
  const me = useMe();
  const { here, others, count, refresh } = useMyTodos(me);
  const [open, setOpen] = React.useState(false);
  const spot = useBesideToolsPill(count > 0);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return undefined;
    refresh();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, refresh]);

  if (!me || count === 0 || !spot) return null;
  const go = (todo) => goToList(todo, close);

  return (
    <div className="hb-mytodos" style={{ left: spot.left, bottom: spot.bottom, opacity: focusMode ? 0 : 1, pointerEvents: focusMode ? 'none' : 'auto' }}>
      {open && <div className="hb-mytodos-scrim" onClick={close} />}
      {open && (
        <div className={`hb-mytodos-panel ${GLASS_HOST}`} style={glossContainer()} role="dialog" aria-label="To-dos for you">
          <div className="hb-mytodos-head">For you <span>{count}</span></div>
          {here.length > 0 && <div className="hb-mytodos-group">This board</div>}
          {here.map((t) => <TodoLine key={`${t.windowId}:${t.itemId}`} todo={t} onGo={go} />)}
          {others.length > 0 && <div className="hb-mytodos-group">Other boards</div>}
          {others.map((t) => <TodoLine key={`${t.boardId}:${t.windowId}:${t.itemId}`} todo={t} onGo={go} />)}
          <div className="hb-mytodos-foot">Tick a to-do off in its list and it leaves here. They are in the Inbox too.</div>
        </div>
      )}
      <button
        type="button"
        data-testid="my-todos-badge"
        className={`hb-mytodos-pill ${GLASS_HOST}`}
        style={glossContainer({ height: spot.height })}
        aria-expanded={open}
        title={`${count} to-do${count === 1 ? '' : 's'} for you`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.Check size={14} stroke={2.4} />
        <span>For you</span>
        <span className="hb-mytodos-count">{count}</span>
      </button>
    </div>
  );
}
