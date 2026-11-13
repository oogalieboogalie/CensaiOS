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
import { GitDiffWindow } from '../src/components/windows/gitDiff/index.jsx';

// Live cursors in Git Diff's Before and After boxes: Pat sees where Sam is
// typing in each box, as a line with Sam's name, and Pat's own cursor goes
// out to teammates. Only a spot in the shared words goes out, never the
// words. All people and words are made up.
beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })); });

const BEFORE = 'Sam Example Bakery opens at nine';
const AFTER = 'Sam Example Bakery opens at ten';
const WIN = { id: 'gd1', kind: 'git-diff', x: 0, y: 0, w: 1000, h: 700, diffBefore: BEFORE, diffAfter: AFTER, diffEditing: true };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

async function openDiff(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  await act(async () => { render(<GitDiffWindow win={WIN} onUpdate={jest.fn()} />); });
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = (testId) => screen.getByTestId(testId).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the Before box shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = await openDiff(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'gd1', 'diffBefore', 'Sam Example'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn('gdv-before')).toHaveAttribute('data-at', '11');
  expect(markIn('gdv-after')).toBeNull();
});

test("the After box shows a teammate's cursor in that box only", async () => {
  const { a, b } = twoDocs();
  const pat = await openDiff(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'gd1', 'diffAfter', 3) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn('gdv-after')).toHaveAttribute('data-at', '3');
  expect(markIn('gdv-before')).toBeNull();
});

test('the boxes keep their own names, not a teammate tag', async () => {
  const { a, b } = twoDocs();
  const pat = await openDiff(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'gd1', 'diffBefore', 2) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(screen.getByRole('textbox', { name: 'Before: paste the old version' })).toBe(screen.getByTestId('gdv-before'));
});

test('typing in either box tells teammates where my cursor is, and leaving takes it away', async () => {
  const { a } = twoDocs();
  const awareness = await openDiff(a);
  jest.useFakeTimers();
  try {
    for (const [testId, field, at] of [['gdv-before', 'diffBefore', 3], ['gdv-after', 'diffAfter', 6]]) {
      const box = screen.getByTestId(testId);
      act(() => { box.focus(); box.setSelectionRange(at, at); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: 'gd1', field }));
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'gd1', field)[0].index).toBe(at);
      act(() => { box.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    }
  } finally {
    jest.useRealTimers();
  }
});
