import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in Image Studio: a button next to "Additional
// Instructions" swaps the prompt (and the instructions, when open) for the
// same words with each person's part tinted in their own colour, and a row of
// names with letter counts (doc/WhoTypedWhat.jsx). Pressing it again goes
// back to writing. Words never change, and nothing is sent to a model.

const PANE = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minWidth: 0, maxHeight: 160, overflowY: 'auto',
  padding: 'var(--space-2) var(--space-2-5)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  background: 'var(--surface-2)', color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'normal',
};

export function ImageStudioWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-is-more" aria-pressed={on} onClick={onToggle}
      title="Show each person's part of the prompt and instructions in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function ImageStudioWhoTypedPane({ windowId, field, label }) {
  return (
    <section style={PANE} aria-label={`Who typed the ${label}`} data-testid={`is-who-typed-${field}`}>
      <WhoTypedWhat windowId={windowId} field={field} />
    </section>
  );
}
