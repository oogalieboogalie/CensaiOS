import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { EXAMPLE_NOTES, noteStats } from './data.js';
import { UNTITLED } from './vault.js';

// Deleting asks once, in place: the note is gone for everyone on the board.
// The question takes the keyboard on "Keep it"; Escape keeps the note too,
// and the keyboard goes back to "Delete note".
function DeleteNote({ onDelete }) {
  const [asking, setAsking] = React.useState(false);
  const kept = React.useRef(false);
  const backHere = React.useCallback((el) => {
    if (el && kept.current) { kept.current = false; el.focus(); }
  }, []);
  const keep = () => { kept.current = true; setAsking(false); };
  if (!asking) {
    return <button type="button" ref={backHere} className="hb-vault-act" onClick={() => setAsking(true)}>Delete note</button>;
  }
  return (
    <span
      className="hb-vault-confirm"
      role="alertdialog"
      aria-label="Delete this note?"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); keep(); } }}
    >
      <span>Delete this note?</span>
      <button type="button" className="hb-vault-act" data-danger="true" onClick={onDelete}>Delete it</button>
      <button type="button" className="hb-vault-act" autoFocus onClick={keep}>Keep it</button>
    </span>
  );
}

export function VaultEditor({ note, source, example, fresh, actions }) {
  const stats = noteStats(note.text);
  const title = note.title || UNTITLED;
  // Someone else's typing lands without moving this person's caret.
  const textRef = React.useRef(null);
  useSharedCaret(textRef, note.text, source);
  // A note just made here opens with its title selected, ready to be typed
  // over, once: opening it again later leaves the cursor where it is.
  const focusFresh = React.useCallback((el) => {
    if (el && fresh) { el.focus(); el.select(); actions.focused(); }
  }, [fresh]);
  return (
    <section className="hb-vault-main" aria-label="Note editor">
      <div className="hb-vault-tabs">
        <div className="hb-vault-tab" data-active="true">
          <span className="hb-vault-tab-label">{title}</span>
          <button type="button" className="hb-vault-tab-x" aria-label={`Close ${title}`} title="Close" onClick={actions.close}>×</button>
        </div>
        <button type="button" className="hb-vault-tab-add" aria-label="New note" title="New note" onClick={actions.create}>+</button>
      </div>

      <div className="hb-vault-crumbs">
        <nav className="hb-vault-path" aria-label="Breadcrumb">
          <span>{example ? 'Examples' : 'Vault'}</span>
          <span className="hb-vault-path-sep">/</span>
          <span data-current="true">{title}</span>
        </nav>
        <div className="hb-vault-crumb-actions">
          {example
            ? <button type="button" className="hb-vault-act" onClick={actions.copy}>Copy to my notes</button>
            : <DeleteNote key={note.id} onDelete={actions.remove} />}
        </div>
      </div>

      {example && (
        <p className="hb-vault-example" role="note">
          This is an example note. Copy it to your notes to change it.
        </p>
      )}
      <input
        key={`title-${note.id}`}
        className="hb-vault-title"
        value={note.title}
        placeholder={UNTITLED}
        aria-label="Note title"
        readOnly={example}
        ref={focusFresh}
        onChange={(e) => actions.rename(e.target.value)}
      />
      <textarea
        key={`text-${note.id}`}
        ref={textRef}
        className="hb-vault-editor"
        value={note.text}
        placeholder="Start writing…"
        aria-label="Note text"
        readOnly={example}
        onChange={(e) => actions.write(e.target.value, e.target.selectionEnd)}
        spellCheck={false}
      />

      <footer className="hb-vault-status">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        {!example && <span className="hb-vault-status-ok" title="Saved on this board" aria-label="Saved">✓</span>}
      </footer>
    </section>
  );
}

// Nothing open: a new vault says so and offers a first note or an example.
export function VaultEmpty({ hasNotes, onNew, onOpen }) {
  return (
    <section className="hb-vault-main hb-vault-empty" aria-label="Note editor">
      <div className="hb-vault-empty-box">
        <h3>{hasNotes ? 'No note open' : 'Your vault is empty'}</h3>
        <p>
          {hasNotes
            ? 'Pick a note on the left, or start a new one.'
            : 'Notes you write here are saved on this board, so anyone you share the board with can read them.'}
        </p>
        <button type="button" className="hb-vault-new" data-primary="true" onClick={onNew}>New note</button>
        {!hasNotes && (
          <button type="button" className="hb-vault-act" onClick={() => onOpen(EXAMPLE_NOTES[0].id)}>
            See an example
          </button>
        )}
      </div>
    </section>
  );
}
