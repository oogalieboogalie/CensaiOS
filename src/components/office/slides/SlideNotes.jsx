import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';

// The speaker-notes box under a slide. On a shared board the notes merge as
// people type; when a teammate's words land, this person's caret stays where
// they were typing.
export function SlideNotes({ notes = '', onChange }) {
  const ref = React.useRef(null);
  useSharedCaret(ref, notes);
  return (
    <textarea ref={ref} className="hb-of-notes" value={notes} placeholder="Speaker notes" aria-label="Speaker notes"
      onChange={(e) => onChange(e.target.value)} />
  );
}
