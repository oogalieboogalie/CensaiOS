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
import { TeleprompterWindow } from '../src/components/windows/teleprompter/index.jsx';

// Live cursors in a Teleprompter script: Pat sees where Sam is typing, as a
// line with Sam's name, and Pat's own cursor goes out to teammates while
// Pat edits. Only a spot in the shared words goes out, never the words.
// All people and words are made up.
const WORDS = 'Welcome to the bakery tour';
const WIN = { id: 'tp1', kind: 'teleprompter', x: 0, y: 0, w: 400, h: 300, text: WORDS };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openPrompter(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<TeleprompterWindow win={WIN} onUpdate={jest.fn()} />);
  return awareness;
}

const editScript = () => {
  fireEvent.click(screen.getByRole('button', { name: /Edit script/ }));
  return screen.getByRole('textbox', { name: 'Script' });
};

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the script shows a teammate's cursor with their name while I edit it", async () => {
  const { a, b } = twoDocs();
  const pat = openPrompter(a);
  editScript();
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'tp1', 'text', 'Welcome'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bakery');
  act(() => applyRemoteAwareness(pat, sam));
  const mark = await screen.findByText('Sam Example');
  expect(mark.closest('[data-teammate-caret]')).toHaveAttribute('data-at', '7');
});

test('no cursors are drawn while the script is in reading mode', () => {
  const { a, b } = twoDocs();
  const pat = openPrompter(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'tp1', 'text', 3) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(screen.queryByText('Sam Example')).toBeNull();
});

test('editing the script tells teammates where my cursor is, and leaving takes it away', () => {
  jest.useFakeTimers();
  try {
    const { a } = twoDocs();
    const awareness = openPrompter(a);
    const box = editScript();
    act(() => { box.focus(); box.setSelectionRange(7, 7); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'tp1', field: 'text' }));
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'tp1', 'text')[0].index).toBe(7);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
