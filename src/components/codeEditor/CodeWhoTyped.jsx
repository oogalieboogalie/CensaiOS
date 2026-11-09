import React from 'react';
import { WhoTypedWhat } from '../doc/WhoTypedWhat.jsx';

// "Who typed what" in the Code Editor: a title-bar button that swaps the
// editor for the code with each person's part tinted in their own colour,
// and a row of names with letter counts (doc/WhoTypedWhat.jsx). Pressing it
// again goes back to editing. The code itself is never changed by this view.

export function CodeWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-pressed={on}
      title="Show each person's part of the code in their own colour" className="hb-code-who-btn">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function CodeWhoTypedPane({ windowId }) {
  return (
    <div className="hb-code-writers" data-testid="code-who-typed">
      <WhoTypedWhat windowId={windowId} field="code" />
    </div>
  );
}
