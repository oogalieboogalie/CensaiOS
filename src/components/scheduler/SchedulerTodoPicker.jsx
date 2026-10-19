import React from 'react';
import { openTodosFromBoard } from '../../lib/schedule/tags.js';
import { useWorkspaceStore } from '../../lib/store.js';

/** "Pick from your to-dos": click an open to-do on the board to make it the task. */
export function SchedulerTodoPicker({ taskText, setTaskText, onSpawn }) {
  // The canvas hands windows only positions, so read the board's windows here.
  const wins = useWorkspaceStore((state) => state.wins);
  const todos = React.useMemo(() => openTodosFromBoard(wins), [wins]);
  const picked = taskText.trim().toLowerCase();

  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">Pick from your to-dos</span>
      {todos.length ? (
        <ul className="hb-sched-todos" aria-label="Open to-dos on the board">
          {todos.map((todo) => (
            <li key={todo.key}>
              <button
                type="button"
                className="hb-sched-todo"
                aria-pressed={picked === todo.text.toLowerCase()}
                title={`From ${todo.list}`}
                onClick={() => setTaskText(todo.text)}
              >
                <span className="hb-sched-todo-box" aria-hidden="true" />
                <span className="hb-sched-todo-text">{todo.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hb-sched-empty">
          No open to-dos on the board yet.{' '}
          {onSpawn && <button type="button" className="hb-sched-more" onClick={() => onSpawn('todos')}>Add a To-do List</button>}
        </p>
      )}
    </div>
  );
}
