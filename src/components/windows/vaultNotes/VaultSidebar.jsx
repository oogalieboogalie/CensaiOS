import React from 'react';
import { Icon } from '../../Icons.jsx';
import { examplesLeft, UNTITLED } from './vault.js';

function NoteRow({ note, active, example = false, onOpen }) {
  return (
    <li>
      <button
        type="button"
        className="hb-vault-base"
        data-active={active ? 'true' : 'false'}
        aria-current={active ? 'true' : undefined}
        onClick={() => onOpen(note.id)}
      >
        <span className="hb-vault-base-name">{note.title || UNTITLED}</span>
        {example && <span className="hb-vault-base-kind">Example</span>}
      </button>
    </li>
  );
}

export function VaultSidebar({ notes, openId, onNew, onOpen }) {
  const examples = examplesLeft(notes);
  return (
    <aside className="hb-vault-sidebar" aria-label="Vault sidebar">
      <div className="hb-vault-sidebar-tools">
        <button type="button" className="hb-vault-new" onClick={onNew}>
          <Icon.Plus size={13} />
          New note
        </button>
      </div>

      <div className="hb-vault-section">
        <div className="hb-vault-section-label">Notes</div>
        {notes.length ? (
          <ul className="hb-vault-base-list" aria-label="Notes">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} active={note.id === openId} onOpen={onOpen} />
            ))}
          </ul>
        ) : (
          <p className="hb-vault-none">No notes yet</p>
        )}
      </div>

      {examples.length > 0 && (
        <div className="hb-vault-section">
          <div className="hb-vault-section-label">Examples</div>
          <ul className="hb-vault-base-list" aria-label="Examples">
            {examples.map((note) => (
              <NoteRow key={note.id} note={note} example active={note.id === openId} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      )}

      <div className="hb-vault-sidebar-foot">
        <span>{notes.length === 1 ? '1 note' : `${notes.length} notes`}</span>
      </div>
    </aside>
  );
}
