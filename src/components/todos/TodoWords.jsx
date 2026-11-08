/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';

// Live cursors in a to-do's words. A to-do's words are shared letter by
// letter (src/lib/collaboration/todoItemText.js), at `items/<n>/text` inside
// the To-do list window. While you edit a to-do, teammates editing it too
// show as a cursor with their name right at the letter, and your cursor goes
// out to them. While you don't, each teammate editing it shows as a small
// name tag on the row. Only a spot goes out, never words.

/** Where a to-do's words sit in the window, or null when it isn't there. */
export function todoWordsField(items, id) {
  if (!Array.isArray(items)) return null;
  const at = items.findIndex((it) => it && String(it.id) === String(id));
  return at < 0 ? null : `items/${at}/text`;
}

/** Teammates' cursors in one to-do's words (empty when not on a live board). */
export function useTodoCarets(windowId, field) {
  return useTeammateCarets(windowId, field, Boolean(windowId && field));
}

/** The box you type a to-do's words in, with teammates' cursors drawn in it. */
export function TodoWordsBox({ value, windowId, field, carets, style, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  useCaretReporter(ref, windowId, field, Boolean(windowId && field));
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
      <input ref={ref} value={text} style={style} {...rest} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </div>
  );
}
