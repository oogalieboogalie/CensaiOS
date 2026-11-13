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
import { ModelArenaWindow } from '../src/components/windows/modelArena/index.jsx';

// Live cursors in the Model Arena request and instructions: Pat sees where
// Sam is typing in each box, as a line with Sam's name, and Pat's own
// cursor goes out to teammates. Only a spot in the shared words goes out,
// never the words. All people and words are made up.
const ASK = 'Sum up the bakery menu';
const RULES = 'Answer in one line';
const WIN = { id: 'ma1', kind: 'modelArena', x: 0, y: 0, w: 700, h: 500, prompt: ASK, system: RULES };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openArena(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<ModelArenaWindow win={WIN} onUpdate={jest.fn()} />);
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

test("the request shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openArena(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'ma1', 'prompt', 'Sum up'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn('Request to send to every model')).toHaveAttribute('data-at', '6');
  expect(markIn('Instructions for every model')).toBeNull();
});

test("the instructions show a teammate's cursor in that box only", async () => {
  const { a, b } = twoDocs();
  const pat = openArena(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'ma1', 'system', 'Answer'.length) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn('Instructions for every model')).toHaveAttribute('data-at', '6');
  expect(markIn('Request to send to every model')).toBeNull();
});

test('typing in either box tells teammates where my cursor is, and leaving takes it away', () => {
  jest.useFakeTimers();
  try {
    const { a } = twoDocs();
    const awareness = openArena(a);
    for (const [label, field, at] of [['Request to send to every model', 'prompt', 3], ['Instructions for every model', 'system', 6]]) {
      const box = screen.getByRole('textbox', { name: label });
      act(() => { box.focus(); box.setSelectionRange(at, at); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: 'ma1', field }));
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'ma1', field)[0].index).toBe(at);
      act(() => { box.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    }
  } finally {
    jest.useRealTimers();
  }
});
