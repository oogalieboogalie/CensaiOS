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
import { VaultNotesWindow } from '../src/components/windows/vaultNotes/index.jsx';

// Live cursors in a Vault note: Pat sees where Sam is typing, as a line with
// Sam's name, and Pat's own cursor goes out to teammates. Each note is its
// own shared words, so a cursor in one note never shows in another. Only a
// spot in the words goes out, never the words. All made up.
const WORDS = 'Sam Example Bakery opening plan';
const OTHER = 'Pat Example shopping list';
const WIN = {
  id: 'v1', kind: 'vaultNotes', x: 0, y: 0, w: 900, h: 600,
  notes: [{ id: 'n-a', title: 'Bakery' }, { id: 'n-b', title: 'Shopping' }],
  'vt.n-a': WORDS, 'vt.n-b': OTHER,
};
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openVault(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<VaultNotesWindow win={WIN} onUpdate={() => {}} />);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const noteBox = () => screen.getByRole('textbox', { name: 'Note text' });
const markIn = () => noteBox().parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the open note shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openVault(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'vt.n-a', 'Sam Example'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn()).toHaveAttribute('data-at', '11');
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = openVault(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'vt.n-a', 11) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  const text = (doc) => doc.getMap('canvas').get('windows').get('v1').get('vt.n-a');
  act(() => { text(b).insert(0, 'New: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn()).toHaveAttribute('data-at', '16');
});

test("a teammate's cursor in another note shows only when that note is open", async () => {
  const { a, b } = twoDocs();
  const pat = openVault(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'vt.n-b', 3) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Shopping/ }));
  await screen.findByText('Sam Example');
  expect(markIn()).toHaveAttribute('data-at', '3');
});

test('typing in a note tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openVault(a);
  jest.useFakeTimers();
  try {
    const box = noteBox();
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'v1', field: 'vt.n-a' }));
    expect(JSON.stringify(sent)).not.toContain('Bakery');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'v1', 'vt.n-a')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
