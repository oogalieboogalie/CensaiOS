import React from 'react';
import { WhoTypedWhat } from '../../doc/WhoTypedWhat.jsx';

// "Who typed what" in a Vault note: a button next to Delete note that swaps
// the note's text box for the same words with each person's part tinted in
// their own colour, and a row of names with letter counts
// (doc/WhoTypedWhat.jsx). Pressing it again goes back to writing. The view
// is per note: opening another note goes back to writing. Words never change.

export function useVaultWhoTyped(noteId) {
  const [shownFor, setShownFor] = React.useState(null);
  const on = shownFor !== null && shownFor === noteId;
  // Leaving the note puts the view away, so coming back opens the text box.
  React.useEffect(() => { setShownFor((was) => (was === noteId ? was : null)); }, [noteId]);
  return { on, toggle: () => setShownFor(on ? null : noteId) };
}

export function VaultWhoTypedButton({ on, onToggle }) {
  return (
    <button type="button" className="hb-vault-act" aria-pressed={on} onClick={onToggle}
      title="Show each person's part of this note in their own colour">
      {on ? 'Hide who typed what' : 'Who typed what'}
    </button>
  );
}

export function VaultWhoTypedPane({ source }) {
  return (
    <div className="hb-vault-writers" data-testid="vault-who-typed">
      <WhoTypedWhat windowId={source.id} field={source.field} />
    </div>
  );
}
