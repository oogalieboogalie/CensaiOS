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
import { IdeaWindow } from '../src/components/IdeaWindow.jsx';

// Live cursors in the Idea Pad save tag: Pat sees where Sam is typing,
// as a line with Sam's name, and Pat's own cursor goes out to teammates. Only
// a spot in the shared words goes out, never the words. All made up.
const MSG = 'Sam Example Bakery loaves page';
const WIN = { id: 'i1', kind: 'idea', x: 0, y: 0, w: 900, h: 600, ideas: ['Fresh bread page'], workItem: MSG };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openIdeaPad(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<IdeaWindow win={WIN} onUpdate={() => {}} />);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = () => screen.getByRole('textbox', { name: 'Save tag' }).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the save tag shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openIdeaPad(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'i1', 'workItem', 'Sam Example'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('loaves');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn()).toHaveAttribute('data-at', '11');
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = openIdeaPad(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'i1', 'workItem', 11) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  const text = (doc) => doc.getMap('canvas').get('windows').get('i1').get('workItem');
  act(() => { text(b).insert(0, 'New: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn()).toHaveAttribute('data-at', '16');
});

test("a teammate's cursor in another field does not show in the save tag", async () => {
  const { a, b } = twoDocs();
  const pat = openIdeaPad(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'i1', 'title', 2) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn()).toBeNull();
});

test('typing in the save tag tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openIdeaPad(a);
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: 'Save tag' });
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'i1', field: 'workItem' }));
    expect(JSON.stringify(sent)).not.toContain('loaves');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'i1', 'workItem')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
