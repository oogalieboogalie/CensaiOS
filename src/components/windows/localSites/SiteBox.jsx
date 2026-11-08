/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';

// One box of the Local Sites form. The form merges box by box and letter by
// letter with a teammate's (see src/lib/collaboration/windowFormText.js), and
// when their letters land in the box you are typing in, your cursor stays put.
// With `windowId` and `box` (which box of the shop's form), teammates' cursors
// show in it with their names, and yours goes out to them. Only a spot goes
// out, never words.
export function SiteBox({ multiline = false, value, windowId, box, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  const field = `site/${box}`;
  const live = Boolean(windowId && box);
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <span className="hb-ls-box">
      {multiline
        ? <textarea ref={ref} className="hb-ls-input" value={text} {...rest} />
        : <input ref={ref} className="hb-ls-input" value={text} {...rest} />}
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </span>
  );
}
