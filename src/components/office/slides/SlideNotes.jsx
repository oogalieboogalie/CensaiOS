import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { slideKey } from '../../../lib/office/slideModel.js';
import { SlideNotesWhoTypedButton, SlideNotesWhoTypedPane } from './SlideNotesWhoTyped.jsx';

// The speaker-notes box under a slide. On a shared board the notes merge as
// people type; when a teammate's words land, this person's caret stays where
// they were typing. With `windowId` and `slideId`, teammates' cursors show in
// the notes with their names, and yours goes out to them. Each slide's notes
// are their own words, so a cursor in slide 2's notes never shows on slide 3.
// Only a spot goes out, never words. "Who typed what" (SlideNotesWhoTyped.jsx)
// puts the text box away and shows each person's part; it reports again once back.
export function SlideNotes({ notes = '', onChange, windowId, slideId }) {
  const ref = React.useRef(null);
  const [writersOn, setWritersOn] = React.useState(false);
  useSharedCaret(ref, notes);
  const field = `${slideKey(slideId)}/notes`;
  const live = Boolean(windowId && slideId);
  useCaretReporter(ref, windowId, field, live && !writersOn);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <div className="hb-of-notesbox">
      {live && <SlideNotesWhoTypedButton on={writersOn} onToggle={() => setWritersOn((v) => !v)} />}
      {writersOn && live ? <SlideNotesWhoTypedPane windowId={windowId} field={field} /> : (
        <>
          <textarea ref={ref} className="hb-of-notes" value={notes} placeholder="Speaker notes" aria-label="Speaker notes"
            onChange={(e) => onChange(e.target.value)} />
          <TeammateCarets boxRef={ref} carets={carets} text={notes} />
        </>
      )}
    </div>
  );
}
