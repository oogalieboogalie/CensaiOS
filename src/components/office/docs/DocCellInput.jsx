/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';

// One box of a Writer table, or a picture's caption. Its words merge letter
// by letter with a teammate's (see src/lib/collaboration/docTableText.js), and
// when their letters land in the box you are typing in, your cursor stays put.
export function DocCellInput({ value, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  return <input ref={ref} value={text} {...rest} />;
}
