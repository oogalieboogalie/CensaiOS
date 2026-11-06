import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';

// The typing box shown while you edit a slide's text box. Each key you press
// is saved straight away, so on a shared board a teammate typing in the same
// box merges with you letter by letter; when their words land, your caret
// stays where you were typing. Leaving the box (or Escape) ends editing.
export function SlideBoxText({ text = '', style, onType, onDone }) {
  const ref = React.useRef(null);
  useSharedCaret(ref, text);
  return (
    <textarea ref={ref} className="hb-of-slidetext" autoFocus value={text} aria-label="Slide text" style={style}
      onChange={(e) => onType(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }} />
  );
}
