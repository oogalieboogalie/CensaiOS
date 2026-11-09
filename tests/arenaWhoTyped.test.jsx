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
import { ModelArenaWindow } from '../src/components/windows/modelArena/index.jsx';

// Who typed what in the Model Arena: Pat Example and Sam Example write the
// request and the instructions on two screens, and "Who typed what" tints
// each person's part with a row of names and letter counts, one for each
// box. Pressing it again goes back to writing. All people and words are made up.
const PAT_ASK = 'Name three made-up towns.';
const SAM_ASK = ' One line each.';
const SAM_RULES = 'Keep it short.';
const win = (prompt, system) => ({ id: 'ma1', kind: 'modelArena', x: 0, y: 0, w: 1100, h: 640, prompt, system });
const board = (prompt, system) => ({ wins: [win(prompt, system)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const REQ = 'Request to send to every model';
const SYS = 'Instructions for every model';

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

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("the request and instructions show each person's part with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, ['', ''], [PAT_ASK, '']);
  sync();
  type(b, SAM, [PAT_ASK, ''], [PAT_ASK + SAM_ASK, SAM_RULES]);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<ModelArenaWindow win={win(PAT_ASK + SAM_ASK, SAM_RULES)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  const ask = within(screen.getByRole('region', { name: 'Who typed the Request' }));
  const askNames = ask.getByRole('list', { name: 'Who typed what' });
  expect(askNames).toHaveTextContent(`Pat Example · ${PAT_ASK.length} letters`);
  expect(askNames).toHaveTextContent(`Sam Example · ${SAM_ASK.length} letters`);
  const askBox = screen.getByTestId('arena-who-typed-prompt');
  expect(askBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_ASK);
  expect(askBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_ASK);
  const rules = within(screen.getByRole('region', { name: 'Who typed the Instructions' }));
  expect(rules.getByRole('list', { name: 'Who typed what' })).toHaveTextContent(`Sam Example · ${SAM_RULES.length} letters`);
  expect(rules.getByRole('list', { name: 'Who typed what' })).not.toHaveTextContent('Pat Example');
  // Both boxes are put away while the view is open.
  expect(screen.queryByRole('textbox', { name: REQ })).toBeNull();
  expect(screen.queryByRole('textbox', { name: SYS })).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, [PAT_ASK + SAM_ASK, SAM_RULES], [PAT_ASK + SAM_ASK + ' Yes.', SAM_RULES]);
  act(() => sync());
  expect(askNames).toHaveTextContent(`Sam Example · ${SAM_ASK.length + 5} letters`);
  // The same button goes back to writing, with the words unchanged.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(screen.getByRole('textbox', { name: REQ })).toHaveValue(PAT_ASK + SAM_ASK);
  expect(screen.getByRole('textbox', { name: SYS })).toHaveValue(SAM_RULES);
});

test('with no instructions, only the request is shown', () => {
  const { a } = twoScreens();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<ModelArenaWindow win={win(PAT_ASK, '')} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByTestId('arena-who-typed-prompt')).toBeInTheDocument();
  expect(screen.queryByTestId('arena-who-typed-system')).toBeNull();
});

test('after the view closes, my cursor goes out to teammates again', () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  render(<ModelArenaWindow win={win(PAT_ASK, '')} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: REQ });
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'ma1', field: 'prompt' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', () => {
  render(<ModelArenaWindow win={win(PAT_ASK, '')} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
