import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in a slide's speaker notes: a small button in the notes
// box's corner swaps the notes for the same words with each person's part
// tinted in their own colour, and a row of names with letter counts
// (doc/WhoTypedWhat.jsx). Pressing it again goes back to writing. Each
// slide's notes are their own: moving to another slide goes back to writing
// (the notes box is remade per slide). Words never change.

export function SlideNotesWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-of-notes-who" aria-pressed={on} onClick={onToggle}
      title="Show each person's part of these notes in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function SlideNotesWhoTypedPane({ windowId, field }) {
  return (
    <div className="hb-of-notes-writers" data-testid="slide-notes-who-typed">
      <WhoTypedWhat windowId={windowId} field={field} />
    </div>
  );
}
