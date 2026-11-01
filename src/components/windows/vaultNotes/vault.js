// The vault's notes live on the window, so they are saved with the board and
// shared like any other window. `notes` lists them, each { id, title } plus
// `fromExample` when copied from an example; each note's words sit in a field
// of their own (textField), which the board keeps as shared text so two
// people typing in the same note both keep what they typed. Which note is
// open is each person's own, like the slide each person is on in Slides. A
// window saved before the vault held several notes has only `title` and
// `text`: that text is its one note, and its words stay in `text`. Pure: no React.
import { NOTE_TEXT_PREFIX } from '../../../../shared/collab/textDiff.js';
import { EXAMPLE_NOTES } from './data.js';

export const UNTITLED = 'Untitled';
export const VAULT_TITLE = 'Vault notes';
const FIRST_NOTE = 'note-1';

export const isExampleId = (id) => EXAMPLE_NOTES.some((note) => note.id === id);

/** The window field holding one note's words. */
export const textField = (id) => (id === FIRST_NOTE ? 'text' : `${NOTE_TEXT_PREFIX}${id}`);

/** What `notes` keeps for a note; its words are kept apart (textField). */
export function listEntry({ id, title, fromExample }) {
  return fromExample ? { id, title, fromExample } : { id, title };
}

/** The window's notes, each with its title and words. */
export function readNotes(win = {}) {
  if (Array.isArray(win.notes)) {
    return win.notes
      .filter((note) => note && typeof note.id === 'string')
      .map((note) => {
        const text = win[textField(note.id)];
        return { ...note, title: typeof note.title === 'string' ? note.title : '', text: typeof text === 'string' ? text : '' };
      });
  }
  if (typeof win.text !== 'string') return [];
  const title = String(win.title || win.fileName || '').replace(/\.md$/i, '') || UNTITLED;
  const copied = EXAMPLE_NOTES.find((note) => note.title === title && note.text === win.text);
  return [{ id: FIRST_NOTE, title, text: win.text, ...(copied ? { fromExample: copied.id } : {}) }];
}

export function findNote(notes, id) {
  return notes.find((note) => note.id === id) || EXAMPLE_NOTES.find((note) => note.id === id) || null;
}

/**
 * The note open for one person: the one they picked while it exists, none
 * once they closed it (`null`), otherwise the first note.
 */
export function openNote(notes, picked) {
  if (picked === null) return null;
  return findNote(notes, picked) || notes[0] || null;
}

/** The examples nobody has copied into these notes yet. */
export function examplesLeft(notes) {
  return EXAMPLE_NOTES.filter((example) => !notes.some((note) => note.fromExample === example.id));
}

function newNoteId() {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A new empty note titled "Untitled" ("Untitled 2" and on when that is taken). */
export function blankNote(notes, makeId = newNoteId) {
  const titles = new Set(notes.map((note) => note.title));
  let title = UNTITLED;
  for (let n = 2; titles.has(title); n += 1) title = `${UNTITLED} ${n}`;
  return { id: makeId(), title, text: '' };
}
