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
import { caretState, readTextCarets, setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { LegionSetup } from '../src/components/windows/legion/LegionSetup.jsx';

// Live cursors in Legion's goal and YAML spec: Pat sees where Sam is typing
// in each box, as a line with Sam's name, and Pat's own cursor goes out to
// teammates. Only a spot in the shared words goes out, never the words.
// All people and words are made up.
beforeEach(() => { global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ runs: [] }) }); });

const GOAL = 'A made-up page for Sam Example Bakery';
const SPEC = 'goal: A made-up page\njobs: []\n';
const WIN = { id: 'l1', kind: 'legion', x: 0, y: 0, w: 1000, h: 700, legionGoal: GOAL, legionSpecYaml: SPEC };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const GOAL_BOX = 'What should the Legion build?';
const SPEC_BOX = 'YAML spec';

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

async function openLegion(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  await act(async () => { render(<LegionSetup win={WIN} onUpdate={jest.fn()} onStart={jest.fn()} onOpen={jest.fn()} />); });
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = (label) => screen.getByRole('textbox', { name: label }).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the goal shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = await openLegion(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'l1', 'legionGoal', 'A made-up'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(GOAL_BOX)).toHaveAttribute('data-at', '9');
  expect(markIn(SPEC_BOX)).toBeNull();
});

test("the YAML spec shows a teammate's cursor in that box only", async () => {
  const { a, b } = twoDocs();
  const pat = await openLegion(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'l1', 'legionSpecYaml', 'goal'.length) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(SPEC_BOX)).toHaveAttribute('data-at', '4');
  expect(markIn(GOAL_BOX)).toBeNull();
});

test('typing in either box tells teammates where my cursor is, and leaving takes it away', async () => {
  const { a } = twoDocs();
  const awareness = await openLegion(a);
  jest.useFakeTimers();
  try {
    for (const [label, field, at] of [[GOAL_BOX, 'legionGoal', 3], [SPEC_BOX, 'legionSpecYaml', 6]]) {
      const box = screen.getByRole('textbox', { name: label });
      act(() => { box.focus(); box.setSelectionRange(at, at); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: 'l1', field }));
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'l1', field)[0].index).toBe(at);
      act(() => { box.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    }
  } finally {
    jest.useRealTimers();
  }
});
