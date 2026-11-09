import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in Legion: a button in the "Try" row swaps the goal (and
// the YAML spec, when shown) for the same words with each person's part
// tinted in their own colour, and a row of names with letter counts
// (doc/WhoTypedWhat.jsx). Pressing it again goes back to writing. Words
// never change, and nothing is started.

export function LegionWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-btn" data-variant="ghost" aria-pressed={on} onClick={onToggle}
      title="Show each person's part of the goal and the YAML spec in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function LegionWhoTypedPane({ windowId, field, label }) {
  return (
    <section className={field === 'legionSpecYaml' ? 'hb-legion-writers hb-legion-yaml-writers' : 'hb-legion-writers'} aria-label={`Who typed the ${label}`} data-testid={`legion-who-typed-${field}`}>
      <span className="hb-legion-label">{label}</span>
      <WhoTypedWhat windowId={windowId} field={field} />
    </section>
  );
}
