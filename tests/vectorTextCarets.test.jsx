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
import { readVector } from '../src/lib/creative/vectorModel.js';
import { VectorPanel } from '../src/components/creative/vector/VectorPanel.jsx';

// Live cursors in Censai Vector text boxes: Pat sees where Sam is typing in
// a text box, as a line with Sam's name, and Pat's own cursor goes out to
// teammates. Each text box is its own words, so a cursor in box 1 never shows
// in box 2. Only a spot goes out, never the words. All words are made up.
const WORDS1 = 'Bake sale on Saturday';
const WORDS2 = 'Sam Example brings pies';
const shape = (text, at, y) => ({ type: 'text', x: 80, y, fill: 'ink', stroke: 'none', sw: 0, opacity: 1, size: 48, weight: 600, text, at });
const WIN = {
  id: 'v1', kind: 'creativeVector', x: 0, y: 0, w: 800, h: 600,
  vectorDoc: { w: 1200, h: 800, bg: 'white', order: ['s1', 's2'] },
  'vs.s1': shape(WORDS1, 1, 120), 'vs.s2': shape(WORDS2, 2, 300),
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

function Panel({ win, start }) {
  const [sel, setSel] = React.useState([start]);
  const doc = readVector(win);
  const one = sel.length === 1 ? doc.shapes[sel[0]] : null;
  const v = { doc, one, style: one || {}, selected: sel, setStyleField: () => {}, select: (ids) => setSel(ids) };
  return <VectorPanel v={v} windowId={win.id} />;
}

function openPanel(doc, win = WIN, start = 's1') {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<Panel win={win} start={start} />);
  return { awareness };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const textBox = () => screen.getByRole('textbox', { name: 'Text' });
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a text box's words are found as shared words, and its colour is not", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'v1', 'vs.s1/text')?.toString()).toBe(WORDS1);
  expect(sharedText(a, 'v1', 'vs.s2/text')?.toString()).toBe(WORDS2);
  expect(sharedText(a, 'v1', 'vs.s1/fill')).toBeNull();
  expect(sharedText(a, 'v1', 'vs.s1')).toBeNull();
});

test("the selected text box shows a teammate's cursor with their name, only in that box", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openPanel(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'vs.s1/text', 'Bake sale'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Saturday');
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(textBox())).toHaveAttribute('data-at', '9');
  expect(markIn(textBox())).toHaveTextContent('Sam Example');
  fireEvent.click(screen.getByRole('button', { name: `Text: ${WORDS2}` }));
  expect(textBox()).toHaveValue(WORDS2);
  expect(markIn(textBox())).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openPanel(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'v1', 'vs.s1/text', 4) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(textBox())).toHaveAttribute('data-at', '4');
  const text = (doc) => sharedText(doc, 'v1', 'vs.s1/text');
  act(() => { text(b).insert(0, 'Big '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(textBox())).toHaveAttribute('data-at', '8');
});

test('typing in a text box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openPanel(a);
  jest.useFakeTimers();
  try {
    const box = textBox();
    act(() => { box.focus(); box.setSelectionRange(2, 2); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'v1', field: 'vs.s1/text' }));
    expect(JSON.stringify(sent)).not.toContain('Saturday');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'v1', 'vs.s1/text')[0].index).toBe(2);
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
  render(<Panel win={noId} start="s1" />);
  jest.useFakeTimers();
  try {
    const box = textBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
