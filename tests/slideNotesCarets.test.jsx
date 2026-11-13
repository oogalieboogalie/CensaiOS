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
import { caretState, readTextCarets, setCaretChannel, sharedText } from '../src/lib/collaboration/textCarets.js';
import { OfficeSlidesWindow } from '../src/components/windows/officeSlides/index.jsx';

// Live cursors in Slides speaker notes: Pat sees where Sam is typing in a
// slide's notes, as a line with Sam's name, and Pat's own cursor goes out to
// teammates. Each slide's notes are their own words, so a cursor in slide 2's
// notes never shows under slide 1. Only a spot goes out, never the words.
// All made up.
const NOTES1 = 'Open with the made-up demo. Thank the team.';
const NOTES2 = 'Sam Example talks about the oven.';
const slide = (title, notes, at) => ({ layout: 'titleBody', blocks: [{ id: `t${at}`, type: 'text', role: 'title', x: 6, y: 7, w: 88, h: 16, text: title }], notes, at });
const WIN = {
  id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, title: 'Made-up pitch',
  officeDeck: { order: ['s1', 's2'], theme: 'censai' }, 'os.s1': slide('Made-up cover', NOTES1, 1), 'os.s2': slide('Made-up plan', NOTES2, 2),
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

function openDeck(doc, win = WIN) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<OfficeSlidesWindow win={win} onUpdate={() => {}} />);
  return { awareness };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const notesBox = () => screen.getByRole('textbox', { name: 'Speaker notes' });
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a slide's notes are found as shared words, and the slide itself is not", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'sl1', 'os.s1/notes')?.toString()).toBe(NOTES1);
  expect(sharedText(a, 'sl1', 'os.s2/notes')?.toString()).toBe(NOTES2);
  expect(sharedText(a, 'sl1', 'os.s1/blocks')).toBeNull();
  expect(sharedText(a, 'sl1', 'os.s1')).toBeNull();
});

test("the notes show a teammate's cursor with their name, only under that slide", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openDeck(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'sl1', 'os.s1/notes', 'Open with'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('demo');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(notesBox())).toHaveAttribute('data-at', '9');
  fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }));
  expect(notesBox()).toHaveValue(NOTES2);
  expect(markIn(notesBox())).toBeNull();
  expect(screen.queryByText('Sam Example')).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openDeck(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'sl1', 'os.s1/notes', 4) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(notesBox())).toHaveAttribute('data-at', '4');
  const text = (doc) => sharedText(doc, 'sl1', 'os.s1/notes');
  act(() => { text(b).insert(0, 'Pat: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(notesBox())).toHaveAttribute('data-at', '9');
});

test('typing in the notes tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openDeck(a);
  jest.useFakeTimers();
  try {
    const box = notesBox();
    act(() => { box.focus(); box.setSelectionRange(2, 2); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'sl1', field: 'os.s1/notes' }));
    expect(JSON.stringify(sent)).not.toContain('demo');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'sl1', 'os.s1/notes')[0].index).toBe(2);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a deck with no window sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  const { id, ...noId } = WIN;
  render(<OfficeSlidesWindow win={noId} onUpdate={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = notesBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
