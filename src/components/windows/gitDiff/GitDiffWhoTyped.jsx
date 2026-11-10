import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in Git Diff: a button under the Before box swaps both
// boxes for the same words with each person's part tinted in their own
// colour, and a row of names with letter counts (doc/WhoTypedWhat.jsx).
// Pressing it again goes back to writing. Words never change.

const BUTTON_PLACE = { gridColumn: 1, gridRow: 2, justifySelf: 'start', marginTop: 10 };
const PANE_SCROLL = { overflow: 'auto', whiteSpace: 'normal' };

export function GitDiffWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="gdv-btn" aria-pressed={on} onClick={onToggle} style={BUTTON_PLACE}
      data-testid="gdv-who-typed" title="Show each person's part of Before and After in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function GitDiffWhoTypedPane({ windowId, field, label }) {
  return (
    <section className="gdv-box gdv-input" style={PANE_SCROLL} aria-label={`Who typed the ${label} text`}
      data-testid={`gdv-who-typed-${field}`}>
      <WhoTypedWhat windowId={windowId} field={field} />
    </section>
  );
}
