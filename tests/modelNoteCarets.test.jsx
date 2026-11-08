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
import { readScene } from '../src/lib/yorware/modelBoard.js';
import { NotesSection } from '../src/components/yorware/model3d/ModelNotes.jsx';

// Live cursors in 3D Viewer notes: Pat sees where Sam is typing in a note
// pinned on a model, as a line with Sam's name, and Pat's own cursor goes
// out to teammates. Each note is its own words, so a cursor in note 1 never
// shows in note 2. Only a spot goes out, never the words. All made up.
const WORDS1 = 'Hole looks too small for the made-up bolt.';
const WORDS2 = 'Sam Example checks the edge.';
const MODEL = { name: 'Made-up bracket', format: 'stl', main: 'b.stl', files: {}, bytes: 0, at: 1 };
const note = (text, at) => ({ model: 'k1', p: [1, 2, 3], text, by: 'Sam Example', at });
const WIN = {
  id: 'v1', kind: 'yor3d', x: 0, y: 0, w: 900, h: 600, m3Scene: { order: ['k1'] },
  'm3.k1': MODEL, 'm3n.n1': note(WORDS1, 2), 'm3n.n2': note(WORDS2, 3),
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

function Notes({ win, startOpen }) {
  const [openNote, setOpenNote] = React.useState(startOpen);
  const m = {
    windowId: win.id, scene: readScene(win), tool: 'orbit', measure: [], openNote, setOpenNote,
    editNote: () => {}, removeNote: () => {},
  };
  return <NotesSection m={m} maxLength={280} />;
}

function openNotes(doc, win = WIN, startOpen = 'n1') {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<Notes win={win} startOpen={startOpen} />);
  return { awareness };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const noteBox = () => screen.getByRole('textbox', { name: 'Note text' });
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a note's words are found as shared words, and its pin is not", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'v1', 'm3n.n1/text')?.toString()).toBe(WORDS1);
  expect(sharedText(a, 'v1', 'm3n.n2/text')?.toString()).toBe(WORDS2);
  expect(sharedText(a, 'v1', 'm3n.n1/by')).toBeNull();
  expect(sharedText(a, 'v1', 'm3n.n1')).toBeNull();
});

test("an open note shows a teammate's cursor with their name, only in that note", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openNotes(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'm3n.n1/text', 'Hole looks'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bolt');
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(noteBox())).toHaveAttribute('data-at', '10');
  expect(markIn(noteBox())).toHaveTextContent('Sam Example');
  fireEvent.click(screen.getByRole('button', { name: WORDS1 }));
  fireEvent.click(screen.getByRole('button', { name: WORDS2 }));
  expect(noteBox()).toHaveValue(WORDS2);
  expect(markIn(noteBox())).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openNotes(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'm3n.n1/text', 4) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(noteBox())).toHaveAttribute('data-at', '4');
  const text = (doc) => sharedText(doc, 'v1', 'm3n.n1/text');
  act(() => { text(b).insert(0, 'Pat: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(noteBox())).toHaveAttribute('data-at', '9');
});

test('typing in a note tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openNotes(a);
  jest.useFakeTimers();
  try {
    const box = noteBox();
    act(() => { box.focus(); box.setSelectionRange(2, 2); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'v1', field: 'm3n.n1/text' }));
    expect(JSON.stringify(sent)).not.toContain('bolt');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'v1', 'm3n.n1/text')[0].index).toBe(2);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a viewer with no window sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  const { id, ...noId } = WIN;
  render(<Notes win={noId} startOpen="n1" />);
  jest.useFakeTimers();
  try {
    const box = noteBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
