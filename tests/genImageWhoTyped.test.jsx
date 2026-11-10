/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { noteSignedInName } from '../src/lib/collaboration/signedInName.js';
import { GenImageWindow } from '../src/components/GenImage.jsx';

// Who typed what in the Image Generator: Pat Example and Sam Example write
// the prompt on two screens, and "Who typed what" tints each person's part
// with a row of names and letter counts. Pressing it again goes back to the
// prompt. All people and words are made up.
const PAT_PROMPT = 'a watercolor of Pat Example Bakery';
const SAM_PROMPT = ' at dawn';
const win = (prompt) => ({ id: 'g1', kind: 'genImage', x: 0, y: 0, w: 460, h: 380, prompt });
const board = (prompt) => ({ wins: [win(prompt)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const WHO = 'Who typed what';
const P = 'Image prompt';

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

async function open(w) {
  await act(async () => { render(<GenImageWindow win={w} onUpdate={() => {}} />); });
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("the prompt shows each person's part with their name", async () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', PAT_PROMPT);
  sync();
  type(b, SAM, PAT_PROMPT, PAT_PROMPT + SAM_PROMPT);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  await open(win(PAT_PROMPT + SAM_PROMPT));
  fireEvent.click(screen.getByRole('button', { name: WHO }));

  const pane = within(screen.getByRole('region', { name: 'Who typed the prompt' }));
  const names = pane.getByRole('list', { name: WHO });
  expect(names).toHaveTextContent(`Pat Example · ${PAT_PROMPT.length} letters`);
  expect(names).toHaveTextContent(`Sam Example · ${SAM_PROMPT.length} letters`);
  const box = screen.getByTestId('gen-who-typed-prompt');
  expect(box.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_PROMPT);
  expect(box.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_PROMPT);
  // Each person gets their own colour.
  const colorOf = (name) => box.querySelector(`[data-typed-by="${name}"]`).style.getPropertyValue('--who');
  expect(colorOf('Pat Example')).toBeTruthy();
  expect(colorOf('Pat Example')).not.toBe(colorOf('Sam Example'));
  // The prompt is put away while the view is open.
  expect(screen.queryByTitle('Edit prompt')).toBeNull();
  expect(screen.queryByRole('textbox', { name: P })).toBeNull();

  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, PAT_PROMPT + SAM_PROMPT, PAT_PROMPT + SAM_PROMPT + '!');
  act(() => sync());
  expect(names).toHaveTextContent(`Sam Example · ${SAM_PROMPT.length + 1} letters`);
  // The same button goes back to the prompt, with the words unchanged.
  fireEvent.click(screen.getByRole('button', { name: `Hide ${WHO.toLowerCase()}` }));
  expect(screen.queryByRole('list', { name: WHO })).toBeNull();
  expect(screen.getByTitle('Edit prompt')).toHaveTextContent(PAT_PROMPT + SAM_PROMPT);
});

test('while writing, the view puts the prompt box away and gives it back', async () => {
  await open(win(''));
  expect(screen.getByRole('textbox', { name: P })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  expect(screen.getByTestId('gen-who-typed-prompt')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: P })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.getByRole('textbox', { name: P })).toBeInTheDocument();
});

test('after the view closes, my cursor goes out to teammates again', async () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  await open(win(PAT_PROMPT));
  fireEvent.click(screen.getByTitle('Edit prompt'));
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: P });
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'g1', field: 'prompt' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', async () => {
  await open(win(PAT_PROMPT));
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
