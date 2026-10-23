import React from 'react';
import { diffText, rebaseCaret, rebaseThrough } from '../../../shared/collab/textDiff.js';
import { remoteOps } from './remoteTextEdits.js';

// Keeps a focused <textarea>'s caret in place when someone else's edit
// replaces its controlled `value`. Plain local typing needs nothing: the DOM
// already holds the new value, so only a value the DOM lacks moves the caret.
// With `source` ({ id, field }) the caret follows the shared doc's own record
// of where the other person's text went; without it, a diff guesses.
export function useSharedCaret(ref, value, source = null) {
  const stateRef = React.useRef({ value, pending: null });
  const state = stateRef.current;
  const el = ref.current;
  if (value !== state.value) {
    const focused = el && typeof document !== 'undefined' && document.activeElement === el;
    if (focused && el.value !== value) {
      const ops = source ? remoteOps(source.id, source.field, el.value, value) : null;
      const move = ops ? (pos) => rebaseThrough(pos, ops) : (pos) => rebaseCaret(pos, diffText(el.value, value));
      state.pending = [move(el.selectionStart), move(el.selectionEnd)];
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
