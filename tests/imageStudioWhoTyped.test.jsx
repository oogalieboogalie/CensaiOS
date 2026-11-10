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
import { ImageStudioPrompt } from '../src/components/windows/imageStudio/ImageStudioPrompt.jsx';
import { useStudioWords } from '../src/components/windows/imageStudio/useStudioWords.js';

// Who typed what in Image Studio: Pat Example and Sam Example write the
// prompt and the additional instructions on two screens, and "Who typed what"
// tints each person's part with a row of names and letter counts, one for
// each box. Pressing it again goes back to writing. All people and words are
// made up.
const PAT_PROMPT = 'a poster for Pat Example Bakery';
const SAM_PROMPT = ' at sunrise';
const SAM_NOTES = 'warm colours';
const PAT_NOTES = ', no text';
const win = (prompt, imageNotes) => ({ id: 's1', kind: 'imageStudio', x: 0, y: 0, w: 720, h: 520, prompt, imageNotes });
const board = (prompt, notes) => ({ wins: [win(prompt, notes)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const WHO = 'Who typed what';

function twoScreens() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, board('', ''), 'local');
  sync();
  return { a, b, sync };
}

function type(doc, who, from, to) {
  noteSignedInName(who?.name ?? null, who?.id ?? null);
  writeStateToDoc(doc, board(...from), board(...to), 'local');
}

// The real prompt panel, wired to the window the way the studio wires it.
function Panel({ w }) {
  const words = useStudioWords(w, () => {});
  return <ImageStudioPrompt winId={w.id} state={{ model: 'imagen-4.0-generate-001' }} words={words} updateFields={() => {}} onGenerate={() => {}} />;
}

async function open(w) {
  await act(async () => { render(<Panel w={w} />); });
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("the prompt and instructions show each person's part with their name", async () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, ['', ''], [PAT_PROMPT, '']);
  sync();
  type(b, SAM, [PAT_PROMPT, ''], [PAT_PROMPT + SAM_PROMPT, SAM_NOTES]);
  sync();
  type(a, PAT, [PAT_PROMPT + SAM_PROMPT, SAM_NOTES], [PAT_PROMPT + SAM_PROMPT, SAM_NOTES + PAT_NOTES]);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  await open(win(PAT_PROMPT + SAM_PROMPT, SAM_NOTES + PAT_NOTES));
  fireEvent.click(screen.getByRole('button', { name: WHO }));

  const prompt = within(screen.getByRole('region', { name: 'Who typed the prompt' }));
  const promptNames = prompt.getByRole('list', { name: WHO });
  expect(promptNames).toHaveTextContent(`Pat Example · ${PAT_PROMPT.length} letters`);
  expect(promptNames).toHaveTextContent(`Sam Example · ${SAM_PROMPT.length} letters`);
  const promptBox = screen.getByTestId('is-who-typed-prompt');
  expect(promptBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_PROMPT);
  expect(promptBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_PROMPT);

  const notes = within(screen.getByRole('region', { name: 'Who typed the additional instructions' }));
  const notesNames = notes.getByRole('list', { name: WHO });
  expect(notesNames).toHaveTextContent(`Sam Example · ${SAM_NOTES.length} letters`);
  expect(notesNames).toHaveTextContent(`Pat Example · ${PAT_NOTES.length} letters`);
  const notesBox = screen.getByTestId('is-who-typed-imageNotes');
  expect(notesBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_NOTES);
  expect(notesBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_NOTES);
  // Each person gets their own colour.
  const colorOf = (name) => promptBox.querySelector(`[data-typed-by="${name}"]`).style.getPropertyValue('--who');
  expect(colorOf('Pat Example')).toBeTruthy();
  expect(colorOf('Pat Example')).not.toBe(colorOf('Sam Example'));

  // Both boxes are put away while the view is open.
  expect(screen.queryByRole('textbox', { name: 'Image prompt' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Additional instructions' })).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, [PAT_PROMPT + SAM_PROMPT, SAM_NOTES + PAT_NOTES], [PAT_PROMPT + SAM_PROMPT + '!', SAM_NOTES + PAT_NOTES]);
  act(() => sync());
  expect(promptNames).toHaveTextContent(`Sam Example · ${SAM_PROMPT.length + 1} letters`);
  // The same button goes back to writing, with the words unchanged.
  fireEvent.click(screen.getByRole('button', { name: `Hide ${WHO.toLowerCase()}` }));
  expect(screen.queryByRole('list', { name: WHO })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Image prompt' })).toHaveValue(PAT_PROMPT + SAM_PROMPT);
  expect(screen.getByRole('textbox', { name: 'Additional instructions' })).toHaveValue(SAM_NOTES + PAT_NOTES);
});

test('with the instructions closed, only the prompt is shown', async () => {
  await open(win(PAT_PROMPT, ''));
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  expect(screen.getByTestId('is-who-typed-prompt')).toBeInTheDocument();
  expect(screen.queryByTestId('is-who-typed-imageNotes')).toBeNull();
});

test('after the view closes, my cursor goes out to teammates again', async () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  await open(win(PAT_PROMPT, ''));
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: 'Image prompt' });
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 's1', field: 'prompt' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', async () => {
  await open(win(PAT_PROMPT, 'warm colours'));
  fireEvent.click(screen.getByRole('button', { name: WHO }));
  expect(screen.getAllByText('Who typed what shows when this board is shared live.')).toHaveLength(2);
});
