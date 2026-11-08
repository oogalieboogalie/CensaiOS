/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';

// One box of the LeadHound brief. When a teammate's letters land in the box
// you are typing in, your cursor stays where you were (the words merge letter
// by letter, see src/lib/collaboration/windowFormText.js). With `windowId`
// and `box` (which box of the brief), or `field` (the path to other words,
// like a lead's draft), teammates' cursors show in it with their names, and
// yours goes out to them. Only a spot goes out, never words.
export function BriefBox({ multiline = false, value, windowId, box, field: path, ...rest }) {
  const ref = React.useRef(null);
  const text = String(value ?? '');
  useSharedCaret(ref, text);
  const field = path || `leadBrief/${box}`;
  const live = Boolean(windowId && (path || box));
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <span className="hb-lh-box">
      {multiline
        ? <textarea ref={ref} className="hb-lh-input" value={text} {...rest} />
        : <input ref={ref} className="hb-lh-input" value={text} {...rest} />}
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </span>
  );
}
