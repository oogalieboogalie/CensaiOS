/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { noteSignedInName } from '../src/lib/collaboration/signedInName.js';
import { VaultNotesWindow } from '../src/components/windows/vaultNotes/index.jsx';

// Who typed what in a Vault note: Pat Example and Sam Example write the same
// note on two screens, and "Who typed what" tints each person's part with a
// row of names and letter counts. Each note is its own: the view goes back
// to writing when another note opens. All people and words are made up.
const PAT_WORDS = 'Made-up Bakery opening plan.';
const SAM_WORDS = ' Bake the bread at six.';
const NOTES = [{ id: 'n-a', title: 'Bakery' }, { id: 'n-b', title: 'Shopping' }];
const win = (words) => ({ id: 'v1', kind: 'vaultNotes', x: 0, y: 0, w: 900, h: 600, notes: NOTES, 'vt.n-a': words, 'vt.n-b': 'Flour' });
const board = (words) => ({ wins: [win(words)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };

function twoScreens() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, board(''), 'local');
  sync();
  return { a, b, sync };
}

function type(doc, who, from, to) {
  noteSignedInName(who?.name ?? null, who?.id ?? null);
  writeStateToDoc(doc, board(from), board(to), 'local');
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("a Vault note shows each person's part with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', PAT_WORDS);
  sync();
  type(b, SAM, PAT_WORDS, PAT_WORDS + SAM_WORDS);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  const { container } = render(<VaultNotesWindow win={win(PAT_WORDS + SAM_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent(`Pat Example · ${PAT_WORDS.length} letters`);
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length} letters`);
  expect(container.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_WORDS);
  expect(container.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_WORDS);
  // The text box is put away while the view is open.
  expect(screen.queryByRole('textbox', { name: 'Note text' })).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, PAT_WORDS + SAM_WORDS, PAT_WORDS + SAM_WORDS + ' Yes.');
  act(() => sync());
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length + 5} letters`);
  // The same button goes back to writing.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveValue(PAT_WORDS + SAM_WORDS);
});

test('opening another note goes back to writing', () => {
  const { a } = twoScreens();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<VaultNotesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByTestId('vault-who-typed')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Shopping'));
  expect(screen.queryByTestId('vault-who-typed')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveValue('Flour');
  // Coming back to the first note opens its text box, not the view.
  fireEvent.click(screen.getByText('Bakery'));
  expect(screen.queryByTestId('vault-who-typed')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveValue(PAT_WORDS);
});

test('after the view closes, my cursor goes out to teammates again', () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  render(<VaultNotesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: 'Note text' });
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'v1', field: 'vt.n-a' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', () => {
  render(<VaultNotesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});

test('an example note has no who-typed button (nobody typed it)', () => {
  render(<VaultNotesWindow win={{ id: 'v2', kind: 'vaultNotes', notes: [] }} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'See an example' }));
  expect(screen.getByRole('button', { name: 'Copy to my notes' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Who typed what' })).toBeNull();
});
