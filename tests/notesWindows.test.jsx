/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import React from 'react';
import * as Y from 'yjs';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { VaultNotesWindow } from '../src/components/windows/vaultNotes/index.jsx';
import { EXAMPLE_NOTES } from '../src/components/windows/vaultNotes/data.js';
import { FinderFilesWindow } from '../src/components/windows/finderFiles/index.jsx';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { PROPS_BY_KIND } from '../src/lib/modules/addPaletteItems.js';
import { NOTES_WINDOW_MANIFESTS } from '../src/lib/manifest/notesWindows.js';

// The window on a board: every change is saved onto the window and shown again.
// It starts as the Add menu makes it.
function Board({ initial = PROPS_BY_KIND.vaultNotes, onPatch = () => {} }) {
  const [win, setWin] = React.useState(initial);
  return (
    <VaultNotesWindow
      win={win}
      onUpdate={(patch) => { onPatch(patch); setWin((current) => ({ ...current, ...patch })); }}
    />
  );
}

const sidebar = () => within(screen.getByLabelText('Vault sidebar'));
const newNote = () => fireEvent.click(sidebar().getByRole('button', { name: 'New note' }));

describe('vaultNotes window', () => {
  test('a new vault is empty and offers a first note; the example is labelled as one', () => {
    const { container } = render(<Board />);
    expect(screen.getByTestId('vault-notes')).toBeTruthy();
    expect(screen.getByText('Your vault is empty')).toBeTruthy();
    expect(screen.getByText('No notes yet')).toBeTruthy();
    const examples = within(screen.getByRole('list', { name: 'Examples' }));
    expect(examples.getByText(EXAMPLE_NOTES[0].title)).toBeTruthy();
    expect(examples.getByText('Example')).toBeTruthy();
    expect(screen.queryByLabelText('Note text')).toBeNull();
    expect(container.textContent).not.toMatch(/alma|Users|Desktop/);
  });

  test('New note opens an Untitled note ready to name, and what is typed is saved on the window', () => {
    const onPatch = jest.fn();
    render(<Board onPatch={onPatch} />);
    newNote();
    const title = screen.getByLabelText('Note title');
    expect(title.value).toBe('Untitled');
    expect(document.activeElement).toBe(title);
    fireEvent.change(title, { target: { value: 'Made-up groceries' } });
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: '- made-up eggs' } });
    const patches = onPatch.mock.calls.map(([patch]) => patch);
    const named = patches.findLast((patch) => patch.notes);
    expect(named.notes).toEqual([{ id: expect.stringMatching(/^note-/), title: 'Made-up groceries' }]);
    // The note comes with its (empty) words field, so first letters typed by two people both land.
    expect(patches[0]).toEqual({ notes: [{ id: named.notes[0].id, title: 'Untitled' }], [`vt.${named.notes[0].id}`]: '' });
    // The words sit in a field of their own, which the board keeps as shared text.
    expect(patches.at(-1)).toEqual({ [`vt.${named.notes[0].id}`]: '- made-up eggs' });
    expect(within(screen.getByRole('list', { name: 'Notes' })).getByText('Made-up groceries')).toBeTruthy();
    expect(screen.getByLabelText('Breadcrumb').textContent).toBe('Vault/Made-up groceries');
    newNote();
    newNote();
    expect(screen.getByLabelText('Note title').value).toBe('Untitled 2');
    expect(screen.getByText('3 notes')).toBeTruthy();
  });

  test('the example opens read-only, without saving anything, and can be copied into my notes', () => {
    const onPatch = jest.fn();
    render(<Board onPatch={onPatch} />);
    fireEvent.click(screen.getByRole('button', { name: 'See an example' }));
    expect(screen.getByRole('note').textContent).toMatch(/example note/i);
    expect(screen.getByLabelText('Note text').readOnly).toBe(true);
    expect(screen.getByLabelText('Breadcrumb').textContent).toBe(`Examples/${EXAMPLE_NOTES[0].title}`);
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy to my notes' }));
    expect(screen.queryByRole('list', { name: 'Examples' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Notes' })).getByText(EXAMPLE_NOTES[0].title)).toBeTruthy();
    const text = screen.getByLabelText('Note text');
    expect(text.readOnly).toBe(false);
    expect(text.value).toBe(EXAMPLE_NOTES[0].text);
    expect(screen.queryByRole('note')).toBeNull();
  });

  test('Delete asks first, then removes the note and its words and opens the next one', () => {
    const onPatch = jest.fn();
    render(<Board onPatch={onPatch} />);
    newNote();
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Made-up first' } });
    newNote();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete note' }));
    expect(screen.getByText('2 notes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(screen.getByText('1 note')).toBeTruthy();
    expect(screen.getByLabelText('Note title').value).toBe('Made-up first');
    const removed = onPatch.mock.calls.at(-1)[0];
    expect(Object.entries(removed).filter(([key]) => key.startsWith('vt.')).map(([, value]) => value)).toEqual([null]);
  });

  test('a new note takes the cursor once; opening it again later leaves the title alone', () => {
    render(<Board />);
    newNote();
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Made-up first' } });
    newNote();
    expect(document.activeElement).toBe(screen.getByLabelText('Note title'));
    const mine = () => within(screen.getByRole('list', { name: 'Notes' }));
    fireEvent.click(mine().getByText('Made-up first'));
    fireEvent.click(mine().getByText('Untitled'));
    expect(screen.getByLabelText('Note title').value).toBe('Untitled');
    expect(document.activeElement).not.toBe(screen.getByLabelText('Note title'));
  });

  test('copying an example someone already copied opens their copy instead of a second one', () => {
    const onUpdate = jest.fn();
    const copy = { id: 'note-copy', title: EXAMPLE_NOTES[0].title, fromExample: EXAMPLE_NOTES[0].id };
    const view = render(<VaultNotesWindow win={{ notes: [] }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'See an example' }));
    view.rerender(<VaultNotesWindow win={{ notes: [copy], 'vt.note-copy': 'made-up copy' }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy to my notes' }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Note text').value).toBe('made-up copy');
    expect(screen.getByLabelText('Note text').readOnly).toBe(false);
  });

  test('closing the open note leaves the list to pick from', () => {
    render(<Board />);
    newNote();
    fireEvent.click(screen.getByRole('button', { name: 'Close Untitled' }));
    expect(screen.getByText('No note open')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('list', { name: 'Notes' })).getByText('Untitled'));
    expect(screen.getByLabelText('Note title').value).toBe('Untitled');
  });

  test('which note is open is each person\'s own; a note someone else deletes falls back to the first', () => {
    const notes = [{ id: 'note-a', title: 'Made-up first' }, { id: 'note-b', title: 'Made-up second' }];
    const pat = render(<VaultNotesWindow win={{ notes }} onUpdate={() => {}} />);
    const sam = render(<VaultNotesWindow win={{ notes }} onUpdate={() => {}} />);
    fireEvent.click(within(pat.container).getByText('Made-up second'));
    expect(within(pat.container).getByLabelText('Note title').value).toBe('Made-up second');
    expect(within(sam.container).getByLabelText('Note title').value).toBe('Made-up first');
    pat.rerender(<VaultNotesWindow win={{ notes: [notes[0]] }} onUpdate={() => {}} />);
    expect(within(pat.container).getByLabelText('Note title').value).toBe('Made-up first');
  });

  test('a window saved before keeps its text as its one note, without the old made-up path', () => {
    const onPatch = jest.fn();
    const { container, unmount } = render(<Board initial={{ title: 'Made-up plan', text: 'made-up words' }} onPatch={onPatch} />);
    expect(screen.getByLabelText('Note title').value).toBe('Made-up plan');
    expect(screen.getByLabelText('Note text').value).toBe('made-up words');
    // Its words stay where they were, so they still merge as before.
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'made-up words, more' } });
    expect(onPatch.mock.calls.at(-1)[0]).toEqual({ text: 'made-up words, more' });
    newNote();
    const first = onPatch.mock.calls.at(-1)[0];
    expect(first.notes.map((note) => note.title)).toEqual(['Made-up plan', 'Untitled']);
    // The first saved list clears the old labels, so the board names it "Vault notes".
    expect(first).toMatchObject({ title: 'Vault notes', fileName: null, pathParts: null, activeBase: null });
    newNote();
    const later = Object.keys(onPatch.mock.calls.at(-1)[0]);
    expect(later).toHaveLength(2);
    expect(later.filter((key) => key === 'notes' || key.startsWith('vt.'))).toHaveLength(2);
    expect(container.textContent).not.toMatch(/alma|Users/);
    unmount();
    const old = { title: EXAMPLE_NOTES[0].title, text: EXAMPLE_NOTES[0].text, pathParts: ['Users', 'alma', 'Desktop'] };
    const second = render(<Board initial={old} />);
    expect(screen.queryByRole('list', { name: 'Examples' })).toBeNull();
    expect(screen.getByLabelText('Note text').value).toBe(EXAMPLE_NOTES[0].text);
    expect(second.container.textContent).not.toMatch(/alma|Users/);
  });

  test('two people adding a note at the same moment both keep theirs', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const vault = { id: 'v1', kind: 'vaultNotes', x: 0, y: 0, w: 980, h: 700, notes: [{ id: 'note-a', title: 'Made-up first', text: '' }] };
    const base = { wins: [vault] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const withNote = (note) => ({ wins: [{ ...vault, notes: [...vault.notes, note] }] });
    writeStateToDoc(a, base, withNote({ id: 'note-pat', title: 'Made-up from Pat', text: '' }), 'local');
    writeStateToDoc(b, base, withNote({ id: 'note-sam', title: 'Made-up from Sam', text: '' }), 'local');
    sync();
    for (const doc of [a, b]) {
      expect(readDocState(doc, base).wins[0].notes.map((n) => n.id).sort()).toEqual(['note-a', 'note-pat', 'note-sam']);
    }
  });

  test('a new vault starts with an empty list, so two first notes made at the same moment are both kept', () => {
    const launcher = NOTES_WINDOW_MANIFESTS.find((m) => m.kind === 'vaultNotes').launcher.props;
    for (const props of [PROPS_BY_KIND.vaultNotes, launcher]) expect(props).toEqual({ title: 'Vault notes', notes: [] });
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const vault = { id: 'v1', kind: 'vaultNotes', x: 0, y: 0, w: 980, h: 700, ...PROPS_BY_KIND.vaultNotes };
    const base = { wins: [vault] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const withNote = (note) => ({ wins: [{ ...vault, notes: [note], [`vt.${note.id}`]: '' }] });
    writeStateToDoc(a, base, withNote({ id: 'note-pat', title: 'Untitled' }), 'local');
    writeStateToDoc(b, base, withNote({ id: 'note-sam', title: 'Untitled' }), 'local');
    sync();
    for (const doc of [a, b]) expect(readDocState(doc, base).wins[0].notes.map((n) => n.id).sort()).toEqual(['note-pat', 'note-sam']);
  });

  test('two people typing in the same note at the same moment both keep their words', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const vault = { id: 'v1', kind: 'vaultNotes', x: 0, y: 0, w: 980, h: 700, notes: [{ id: 'note-a', title: 'Made-up first' }], 'vt.note-a': 'made-up middle' };
    const base = { wins: [vault] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const typed = (words) => ({ wins: [{ ...vault, 'vt.note-a': words }] });
    writeStateToDoc(a, base, typed('Pat made-up middle'), 'local');
    writeStateToDoc(b, base, typed('made-up middle Sam'), 'local');
    sync();
    for (const doc of [a, b]) expect(readDocState(doc, base).wins[0]['vt.note-a']).toBe('Pat made-up middle Sam');
  });
});

// The Finder lists a real project's files (tests/finderFiles.test.jsx); with
// none it shows nothing made up.
describe('finderFiles window', () => {
  test('with no project it says so, with no made-up computer', () => {
    render(<FinderFilesWindow win={{}} onUpdate={() => {}} />);
    expect(screen.getByTestId('finder-files')).toBeTruthy();
    expect(screen.getByText('No project is open on this board.')).toBeTruthy();
    expect(screen.queryByText(/Downloads|AirDrop|officepc|Favorites|Tags|nectarine/)).toBeNull();
  });
});
