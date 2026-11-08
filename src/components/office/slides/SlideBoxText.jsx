import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';

// The typing box shown while you edit a slide's text box. Each key you press
// is saved straight away, so on a shared board a teammate typing in the same
// box merges with you letter by letter; when their words land, your caret
// stays where you were typing. Leaving the box (or Escape) ends editing.
// With a `field` (slideBoxField), a teammate typing in the same box shows as
// a line with their name right at the letter, and your cursor goes out to
// them (only the spot, never the words).
export function SlideBoxText({ text = '', style, onType, onDone, windowId, field }) {
  const ref = React.useRef(null);
  const live = Boolean(windowId && field);
  useSharedCaret(ref, text);
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <div className="hb-of-slidetextbox">
      <textarea ref={ref} className="hb-of-slidetext" autoFocus value={text} aria-label="Slide text" style={style}
        onChange={(e) => onType(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => onDone(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </div>
  );
}
