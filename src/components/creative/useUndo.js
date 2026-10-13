// Undo and redo for the Censai Creative editors. Every change goes through
// `update(patch)`, which remembers what those fields held before. Undo puts
// your own earlier values back (only the fields you changed), so it never
// rolls back what a teammate did elsewhere in the same file.
import React from 'react';

const LIMIT = 60;

export function useUndo(win, onUpdate) {
  const winRef = React.useRef(win);
  winRef.current = win;
  const stacks = React.useRef({ undo: [], redo: [] });
  const [, bump] = React.useReducer((n) => n + 1, 0);

  const snapshot = (patch) => {
    const before = {};
    for (const key of Object.keys(patch)) before[key] = winRef.current?.[key] ?? null;
    return before;
  };

  const update = React.useCallback((patch, { record = true } = {}) => {
    if (!patch || !Object.keys(patch).length) return;
    if (record) {
      const s = stacks.current;
      s.undo.push({ before: snapshot(patch), after: patch });
      if (s.undo.length > LIMIT) s.undo.shift();
      s.redo = [];
      bump();
    }
    onUpdate?.(patch);
  }, [onUpdate]);

  const undo = React.useCallback(() => {
    const s = stacks.current;
    const step = s.undo.pop();
    if (!step) return;
    s.redo.push({ before: snapshot(step.after), after: step.after });
    onUpdate?.(step.before);
    bump();
  }, [onUpdate]);

  const redo = React.useCallback(() => {
    const s = stacks.current;
    const step = s.redo.pop();
    if (!step) return;
    s.undo.push({ before: snapshot(step.after), after: step.after });
    onUpdate?.(step.after);
    bump();
  }, [onUpdate]);

  /**
   * Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Returns true when
   * handled. The key stops here, so the board's own undo doesn't also run
   * and take back a second, older change.
   */
  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return false;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); return true; }
    if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); e.stopPropagation(); redo(); return true; }
    return false;
  };

  return { update, undo, redo, onKey, canUndo: stacks.current.undo.length > 0, canRedo: stacks.current.redo.length > 0 };
}

/** True when a key event came from a text field, where editor shortcuts stay off. */
export function typingIn(e) {
  return Boolean(e.target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}
