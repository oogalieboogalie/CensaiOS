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
import { OfficeSlidesWindow } from '../src/components/windows/officeSlides/index.jsx';

// Who typed what in Slides speaker notes: Pat Example and Sam Example write
// one slide's notes on two screens, and "Who typed what" tints each person's
// part with a row of names and letter counts. Each slide's notes are their
// own: moving to another slide goes back to writing. All people and words
// are made up.
const PAT_WORDS = 'Open with the made-up demo.';
const SAM_WORDS = ' Thank the bakery team.';
const slide = (title, notes, at) => ({ layout: 'titleBody', blocks: [{ id: `t${at}`, type: 'text', role: 'title', x: 6, y: 7, w: 88, h: 16, text: title }], notes, at });
const win = (notes) => ({
  id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, title: 'Made-up pitch',
  officeDeck: { order: ['s1', 's2'], theme: 'censai' }, 'os.s1': slide('Made-up cover', notes, 1), 'os.s2': slide('Made-up plan', 'Flour first.', 2),
});
const board = (notes) => ({ wins: [win(notes)] });
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

const notesBox = () => screen.getByRole('textbox', { name: 'Speaker notes' });

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("a slide's speaker notes show each person's part with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', PAT_WORDS);
  sync();
  type(b, SAM, PAT_WORDS, PAT_WORDS + SAM_WORDS);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  const { container } = render(<OfficeSlidesWindow win={win(PAT_WORDS + SAM_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent(`Pat Example · ${PAT_WORDS.length} letters`);
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length} letters`);
  expect(container.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_WORDS);
  expect(container.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_WORDS);
  // The notes box is put away while the view is open.
  expect(screen.queryByRole('textbox', { name: 'Speaker notes' })).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, PAT_WORDS + SAM_WORDS, PAT_WORDS + SAM_WORDS + ' Yes.');
  act(() => sync());
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length + 5} letters`);
  // The same button goes back to writing.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(notesBox()).toHaveValue(PAT_WORDS + SAM_WORDS);
});

test('moving to another slide goes back to writing', () => {
  const { a } = twoScreens();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByTestId('slide-notes-who-typed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }));
  expect(screen.queryByTestId('slide-notes-who-typed')).toBeNull();
  expect(notesBox()).toHaveValue('Flour first.');
  fireEvent.click(screen.getByRole('button', { name: 'Slide 1' }));
  expect(screen.queryByTestId('slide-notes-who-typed')).toBeNull();
  expect(notesBox()).toHaveValue(PAT_WORDS);
});

test('after the view closes, my cursor goes out to teammates again', () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = notesBox();
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'sl1', field: 'os.s1/notes' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', () => {
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
