import React from 'react';
import { WhoTypedWhat } from './doc/WhoTypedWhat.jsx';

// "Who typed what" in the Image Generator: a button next to the prompt swaps
// it for the same words with each person's part tinted in their own colour,
// and a row of names with letter counts (doc/WhoTypedWhat.jsx). Pressing it
// again goes back to the prompt. Words never change, and nothing is sent to
// a model.

const BUTTON = {
  all: 'unset', cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--radius-lg)', whiteSpace: 'nowrap',
  color: 'var(--ink-soft)', background: 'var(--surface-2)', fontSize: 'var(--text-sm)',
};
const PANE = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minWidth: 0, maxHeight: 120, overflowY: 'auto',
  padding: '6px 10px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', lineHeight: 1.5, whiteSpace: 'normal',
};

export function GenImageWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" style={BUTTON} aria-pressed={on} onClick={onToggle}
      title="Show each person's part of the prompt in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function GenImageWhoTypedPane({ windowId }) {
  return (
    <section style={PANE} aria-label="Who typed the prompt" data-testid="gen-who-typed-prompt">
      <WhoTypedWhat windowId={windowId} field="prompt" />
    </section>
  );
}
