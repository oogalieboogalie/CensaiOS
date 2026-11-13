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
import { LegionSetup } from '../src/components/windows/legion/LegionSetup.jsx';

// Who typed what in Legion: Pat Example and Sam Example write the goal and
// the YAML spec on two screens, and "Who typed what" tints each person's
// part with a row of names and letter counts, one for each box. Pressing it
// again goes back to writing. Nothing is started. All people and words are made up.
beforeEach(() => { global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ runs: [] }) }); });

const PAT_GOAL = 'A made-up page for Pat Example Bakery.';
const SAM_GOAL = ' With a menu.';
const SAM_SPEC = 'goal: A made-up page\njobs: []\n';
const win = (legionGoal, legionSpecYaml) => ({ id: 'lg1', kind: 'legion', x: 0, y: 0, w: 1100, h: 640, legionGoal, legionSpecYaml });
const board = (goal, spec) => ({ wins: [win(goal, spec)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const GOAL_BOX = 'What should the Legion build?';
const SPEC_BOX = 'YAML spec';

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
  await act(async () => { render(<LegionSetup win={w} onUpdate={jest.fn()} onStart={jest.fn()} onOpen={jest.fn()} />); });
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("the goal and the YAML spec show each person's part with their name", async () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, ['', ''], [PAT_GOAL, '']);
  sync();
  type(b, SAM, [PAT_GOAL, ''], [PAT_GOAL + SAM_GOAL, SAM_SPEC]);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  await open(win(PAT_GOAL + SAM_GOAL, SAM_SPEC));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  const goal = within(screen.getByRole('region', { name: 'Who typed the Goal' }));
  const goalNames = goal.getByRole('list', { name: 'Who typed what' });
  expect(goalNames).toHaveTextContent(`Pat Example · ${PAT_GOAL.length} letters`);
  expect(goalNames).toHaveTextContent(`Sam Example · ${SAM_GOAL.length} letters`);
  const goalBox = screen.getByTestId('legion-who-typed-legionGoal');
  expect(goalBox.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_GOAL);
  expect(goalBox.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_GOAL);
  const spec = within(screen.getByRole('region', { name: 'Who typed the YAML spec' }));
  expect(spec.getByRole('list', { name: 'Who typed what' })).toHaveTextContent(`Sam Example · ${SAM_SPEC.length} letters`);
  expect(spec.getByRole('list', { name: 'Who typed what' })).not.toHaveTextContent('Pat Example');
  // Both boxes are put away while the view is open.
  expect(screen.queryByRole('textbox', { name: GOAL_BOX })).toBeNull();
  expect(screen.queryByRole('textbox', { name: SPEC_BOX })).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, [PAT_GOAL + SAM_GOAL, SAM_SPEC], [PAT_GOAL + SAM_GOAL + ' Yes.', SAM_SPEC]);
  act(() => sync());
  expect(goalNames).toHaveTextContent(`Sam Example · ${SAM_GOAL.length + 5} letters`);
  // The same button goes back to writing, with the words unchanged.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(screen.getByRole('textbox', { name: GOAL_BOX })).toHaveValue(PAT_GOAL + SAM_GOAL);
  expect(screen.getByRole('textbox', { name: SPEC_BOX })).toHaveValue(SAM_SPEC);
});

test('with no YAML spec, only the goal is shown', async () => {
  const { a } = twoScreens();
  act(() => setCaretChannel(a, new Awareness(a)));
  await open(win(PAT_GOAL, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByTestId('legion-who-typed-legionGoal')).toBeInTheDocument();
  expect(screen.queryByTestId('legion-who-typed-legionSpecYaml')).toBeNull();
});

test('after the view closes, my cursor goes out to teammates again', async () => {
  const { a } = twoScreens();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  await open(win(PAT_GOAL, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: GOAL_BOX });
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState().caret).toEqual(expect.objectContaining({ windowId: 'lg1', field: 'legionGoal' }));
  } finally {
    jest.useRealTimers();
  }
});

test('with the board not shared live, the view says so', async () => {
  await open(win(PAT_GOAL, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
