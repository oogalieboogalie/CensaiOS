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
import { DocWindow } from '../src/components/DocWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

// Live cursors in a Document: Pat sees where Sam is typing, as a line in
// Sam's colour with Sam's name, and the spot moves with the words when Pat
// types in front of it. Only a spot in the shared words goes out, never the
// words themselves. All people and words are made up.
const WORDS = 'Order rye flour';
const board = (text = WORDS) => ({ wins: [{ id: 'd1', kind: 'doc', x: 0, y: 0, w: 400, h: 300, title: 'Bakery notes', text }] });
const SAM = { id: 'sam-1', name: 'Sam Example', color: 'hsl(1 72% 52%)' };
const PAT = { id: 'pat-1', name: 'Pat Example', color: 'hsl(2 72% 52%)' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, board(), 'local');
  sync();
  return { a, b, sync };
}

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
  useWorkspaceStore.getState().setActiveId(null);
});

test("Sam's cursor moves with the words when Pat types in front of it", () => {
  const { a, b, sync } = twoDocs();
  const samCaret = caretState(b, 'd1', 'text', 'Order rye'.length);
  expect(JSON.stringify(samCaret)).not.toContain('rye');
  const states = new Map([[2, { user: SAM, caret: samCaret }]]);
  expect(readTextCarets(states, 1, a, 'd1', 'text')).toEqual([expect.objectContaining({ index: 9, name: 'Sam Example' })]);
  writeStateToDoc(a, board(), board(`Today: ${WORDS}`), 'local');
  sync();
  expect(readTextCarets(states, 1, a, 'd1', 'text')[0].index).toBe('Today: Order rye'.length);
});

test('my own cursor, other windows and broken spots are left out', () => {
  const { a, b } = twoDocs();
  const here = caretState(b, 'd1', 'text', 3);
  const states = new Map([
    [1, { user: PAT, caret: here }],
    [3, { user: SAM, caret: { ...here, windowId: 'other' } }],
    [4, { user: SAM, caret: { ...here, at: 'not a spot' } }],
    [5, { caret: here }],
    [6, { user: SAM, caret: { ...here, at: { tname: 'madeUpJunk' } } }],
  ]);
  expect(readTextCarets(states, 1, a, 'd1', 'text')).toEqual([]);
  // A spot naming a top-level type never makes that type in my board doc.
  expect([...a.share.keys()]).not.toContain('madeUpJunk');
});

function openDoc(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  useWorkspaceStore.getState().setActiveId('d1');
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
  render(<DocWindow win={{ ...board().wins[0], annotations: [] }} onUpdate={jest.fn()} onSpawn={jest.fn()}
    onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  return awareness;
}

test("a Document shows a teammate's cursor with their name while I type in it", async () => {
  const { a, b } = twoDocs();
  const pat = openDoc(a);
  fireEvent.mouseUp(screen.getByText(WORDS));
  await screen.findByRole('textbox', { name: 'Document text' });
  // Sam joins on another screen and puts the cursor after "Order".
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'd1', 'text', 5) });
  act(() => applyRemoteAwareness(pat, sam));
  const mark = await screen.findByText('Sam Example');
  expect(mark.closest('[data-teammate-caret]')).toHaveAttribute('data-teammate-caret', 'Sam Example');
});

test('typing in a Document tells teammates where my cursor is, and leaving takes it away', async () => {
  jest.useFakeTimers();
  try {
    const { a } = twoDocs();
    const awareness = openDoc(a);
    fireEvent.mouseUp(screen.getByText(WORDS));
    const box = await screen.findByRole('textbox', { name: 'Document text' });
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'd1', field: 'text' }));
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'd1', 'text')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

// Pass Sam's awareness to Pat's, as the board connection would.
function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}
