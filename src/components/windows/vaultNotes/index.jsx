import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { Icon } from '../../Icons.jsx';
import { mergeWithLatest } from '../../../lib/collaboration/sharedTextEdit.js';
import { reportTyping } from '../../../lib/collaboration/liveText.js';
import { VaultSidebar } from './VaultSidebar.jsx';
import { VaultEditor, VaultEmpty } from './VaultEditor.jsx';
import { blankNote, isExampleId, listEntry, openNote, readNotes, textField, UNTITLED, VAULT_TITLE } from './vault.js';

// An Obsidian-like note vault. A new one is empty, with a "New note" button;
// example notes stay under Examples, read-only until copied (vault.js).
export function VaultNotesWindow({ win = {}, onUpdate }) {
  const notes = readNotes(win);
  // Which note is open is this person's own; undefined means the first one.
  const [picked, setPicked] = React.useState(undefined);
  // The note this person just made gets the cursor once; one a teammate makes does not.
  const [fresh, setFresh] = React.useState(null);
  const open = openNote(notes, picked);

  // A vault saved before this one held several notes still carries its old
  // labels (the note's file name, a made-up folder path); its first saved
  // list of notes clears them, so the board names it "Vault notes".
  const old = Array.isArray(win.notes) ? {} : { title: VAULT_TITLE, fileName: null, pathParts: null, activeBase: null };
  const saveNotes = (next, more = {}) => onUpdate?.({ ...old, notes: next.map(listEntry), ...more });
  const show = (id) => {
    setFresh(null);
    setPicked(id);
  };
  // The words field is made with the note, even empty, so two people typing
  // its first letters at once type into one shared text.
  const add = (note, words = '') => {
    show(note.id);
    setFresh(note.id);
    saveNotes([...notes, note], { [textField(note.id)]: words });
  };
  const actions = {
    create: () => add(blankNote(notes)),
    open: show,
    close: () => show(null),
    focused: () => setFresh(null),
    rename: (title) => saveNotes(notes.map((note) => (note.id === open.id ? { ...note, title } : note))),
    // Typing merges with what others typed meanwhile, as in a Document.
    write: (value, caret) => {
      const field = textField(open.id);
      onUpdate?.({ [field]: mergeWithLatest(win.id, field, open.text, value, caret) });
      reportTyping(win.id);
    },
    // Someone may have copied this example already: open their copy instead.
    copy: () => {
      const copied = notes.find((note) => note.fromExample === open.id);
      if (copied) show(copied.id);
      else add({ ...blankNote(notes), title: open.title, fromExample: open.id }, open.text);
    },
    remove: () => {
      const at = notes.findIndex((note) => note.id === open.id);
      const rest = notes.filter((note) => note.id !== open.id);
      setPicked(rest[Math.min(at, rest.length - 1)]?.id ?? null);
      const field = textField(open.id);
      saveNotes(rest, { [field]: field === 'text' ? '' : null });
    },
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Files size={14} />}
        label={open ? open.title || UNTITLED : VAULT_TITLE}
        subtitle="vault"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div className="hb-vault" data-testid="vault-notes">
        <VaultSidebar notes={notes} openId={open?.id ?? null} onNew={actions.create} onOpen={actions.open} />
        {open ? (
          <VaultEditor
            note={open}
            source={{ id: win.id, field: textField(open.id) }}
            example={isExampleId(open.id)}
            fresh={fresh === open.id}
            actions={actions}
          />
        ) : (
          <VaultEmpty hasNotes={notes.length > 0} onNew={actions.create} onOpen={actions.open} />
        )}
      </div>
    </>
  );
}

export default VaultNotesWindow;
