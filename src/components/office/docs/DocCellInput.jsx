/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';

// One box of a Writer table, or a picture's caption. Its words merge letter
// by letter with a teammate's (see src/lib/collaboration/docTableText.js), and
// when their letters land in the box you are typing in, your cursor stays put.
// With `windowId` and `field` (the box's path in the board, like
// `ob.b3/rows/1/2`), teammates' cursors in this box show at the letter with
// their names, and yours goes out to them. Only a spot goes out, never words.
export function DocCellInput({ value, windowId, field, readOnly, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  const live = Boolean(windowId && field);
  useCaretReporter(ref, windowId, field, live && !readOnly);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <span className="hb-of-cellbox">
      <input ref={ref} value={text} readOnly={readOnly} {...rest} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </span>
  );
}
