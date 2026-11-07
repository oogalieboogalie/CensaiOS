/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';

// One box of the LeadHound brief. When a teammate's letters land in the box
// you are typing in, your cursor stays where you were (the words merge letter
// by letter, see src/lib/collaboration/windowFormText.js).
export function BriefBox({ multiline = false, value, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  return multiline
    ? <textarea ref={ref} className="hb-lh-input" value={text} {...rest} />
    : <input ref={ref} className="hb-lh-input" value={text} {...rest} />;
}
