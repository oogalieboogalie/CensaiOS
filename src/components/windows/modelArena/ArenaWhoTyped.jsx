import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in the Model Arena: a button next to "Add instructions"
// swaps the request (and the instructions, when shown) for the same words
// with each person's part tinted in their own colour, and a row of names
// with letter counts (doc/WhoTypedWhat.jsx). Pressing it again goes back to
// writing. Words never change, and nothing is sent to a model.

export function ArenaWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-btn" data-variant="ghost" aria-pressed={on} onClick={onToggle}
      title="Show each person's part of the request and instructions in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function ArenaWhoTypedPane({ windowId, field, label }) {
  return (
    <section className="hb-arena-writers" aria-label={`Who typed the ${label}`} data-testid={`arena-who-typed-${field}`}>
      <span className="hb-arena-label">{label}</span>
      <WhoTypedWhat windowId={windowId} field={field} />
    </section>
  );
}
