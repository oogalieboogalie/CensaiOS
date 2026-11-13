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
import { GitDiffWindow } from '../src/components/windows/gitDiff/index.jsx';

// Who typed what in Git Diff: Pat Example and Sam Example write the Before
// and After texts on two screens, and "Who typed what" tints each person's
// part with a row of names and letter counts, one for each box. Pressing it
// again goes back to writing. All people and words are made up.
beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })); });

const PAT_BEFORE = 'Pat Example Bakery opens at nine';
const SAM_BEFORE = ' on Monday';
const SAM_AFTER = 'Sam Example Bakery opens at ten';
const PAT_AFTER = ' every day';
const win = (diffBefore, diffAfter) => ({ id: 'gd1', kind: 'gitDiff', x: 0, y: 0, w: 1000, h: 700, diffBefore, diffAfter, diffEditing: true });
const board = (before, after) => ({ wins: [win(before, after)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };

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

async function open(w) {
  await act(async () => { render(<GitDiffWindow win={w} onUpdate={jest.fn()} />); });
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("Before and After show each person's part with their name", async () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, ['', ''], [PAT_BEFORE, '']);
  sync();
  type(b, SAM, [PAT_BEFORE, ''], [PAT_BEFORE + SAM_BEFORE, SAM_AFTER]);
  sync();
  type(a, PAT, [PAT_BEFORE + SAM_BEFORE, SAM_AFTER], [PAT_BEFORE + SAM_BEFORE, SAM_AFTER + PAT_AFTER]);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  await open(win(PAT_BEFORE + SAM_BEFORE, SAM_AFTER + PAT_AFTER));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));

  const before = within(screen.getByRole('region', { name: 'Who typed the Before text' }));
  const beforeNames = before.getByRole('list', { name: 'Who typed what' });
  expect(beforeNames).toHaveTextContent(`Pat Example · ${PAT_BEFORE.length} letters`);
  expect(beforeNames).toHaveTextContent(`Sam Example · ${SAM_BEFORE.length} letters`);
  const beforeBox = screen.getByTestId('gdv-who-typed-diffBefore');
  expect(beforeBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_BEFORE);
  expect(beforeBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_BEFORE);

  const after = within(screen.getByRole('region', { name: 'Who typed the After text' }));
  const afterNames = after.getByRole('list', { name: 'Who typed what' });
  expect(afterNames).toHaveTextContent(`Sam Example · ${SAM_AFTER.length} letters`);
  expect(afterNames).toHaveTextContent(`Pat Example · ${PAT_AFTER.length} letters`);
  const afterBox = screen.getByTestId('gdv-who-typed-diffAfter');
  expect(afterBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_AFTER);
  expect(afterBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_AFTER);
  // Each person gets their own colour.
  const colorOf = (name) => beforeBox.querySelector(`[data-typed-by="${name}"]`).style.getPropertyValue('--who');
  expect(colorOf('Pat Example')).toBeTruthy();
  expect(colorOf('Pat Example')).not.toBe(colorOf('Sam Example'));

  // Both boxes are put away while the view is open.
  expect(screen.queryByTestId('gdv-before')).toBeNull();
  expect(screen.queryByTestId('gdv-after')).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, [PAT_BEFORE + SAM_BEFORE, SAM_AFTER + PAT_AFTER], [PAT_BEFORE + SAM_BEFORE + '!', SAM_AFTER + PAT_AFTER]);
  act(() => sync());
  expect(beforeNames).toHaveTextContent(`Sam Example · ${SAM_BEFORE.length + 1} letters`);
  // The same button goes back to writing, with the words unchanged.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(screen.getByTestId('gdv-before')).toHaveValue(PAT_BEFORE + SAM_BEFORE);
  expect(screen.getByTestId('gdv-after')).toHaveValue(SAM_AFTER + PAT_AFTER);
});

test('after the view closes, my cursor goes out to teammates again', async () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  await open(win(PAT_BEFORE, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByTestId('gdv-before');
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'gd1', field: 'diffBefore' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', async () => {
  await open(win(PAT_BEFORE, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getAllByText('Who typed what shows when this board is shared live.')).toHaveLength(2);
});
