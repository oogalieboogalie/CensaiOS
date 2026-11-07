/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';

// One box of the Local Sites form. The form merges box by box and letter by
// letter with a teammate's (see src/lib/collaboration/windowFormText.js), and
// when their letters land in the box you are typing in, your cursor stays put.
export function SiteBox({ multiline = false, value, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  return multiline
    ? <textarea ref={ref} className="hb-ls-input" value={text} {...rest} />
    : <input ref={ref} className="hb-ls-input" value={text} {...rest} />;
}
