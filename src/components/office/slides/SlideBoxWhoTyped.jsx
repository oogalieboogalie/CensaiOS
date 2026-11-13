import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in a slide's text box: while a text box is selected, a
// small button on its top left corner swaps the box's words for the same
// words with each person's part tinted in their own colour, and a row of
// names with letter counts (doc/WhoTypedWhat.jsx), the same view as the
// speaker notes (SlideNotesWhoTyped.jsx). Pressing it again, picking another
// box or double-clicking to type goes back to the words. Words never change.

const stop = (e) => e.stopPropagation();

export function SlideBoxWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-of-sblock-who" aria-pressed={on} onPointerDown={stop} onClick={onToggle}
      aria-label={on ? 'Hide who typed this box' : 'Who typed this box'}
      title="Show each person's part of this text box in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function SlideBoxWhoTypedPane({ windowId, field }) {
  return (
    <div className="hb-of-sblock-writers" data-testid="slide-box-who-typed" onPointerDown={stop}>
      <WhoTypedWhat windowId={windowId} field={field} />
    </div>
  );
}
