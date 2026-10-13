import React from 'react';
import { diffText, rebaseCaret } from '../../../server/collab/textDiff.js';

// Keeps a focused <textarea>'s caret in place when someone else's edit
// replaces its controlled `value`. Plain local typing needs nothing: the DOM
// already holds the new value, so only a value the DOM lacks moves the caret.
export function useSharedCaret(ref, value) {
  const stateRef = React.useRef({ value, pending: null });
  const state = stateRef.current;
  const el = ref.current;
  if (value !== state.value) {
    const focused = el && typeof document !== 'undefined' && document.activeElement === el;
    if (focused && el.value !== value) {
      const op = diffText(el.value, value);
      state.pending = [rebaseCaret(el.selectionStart, op), rebaseCaret(el.selectionEnd, op)];
    }
    state.value = value;
  }
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!state.pending || !node) return;
    const [start, end] = state.pending;
    state.pending = null;
    node.setSelectionRange(start, end);
  });
}
