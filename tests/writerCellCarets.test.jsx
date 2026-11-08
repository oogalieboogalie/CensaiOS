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
import { OfficeDocsWindow } from '../src/components/windows/officeDocs/index.jsx';

// Live cursors in Writer table cells and picture captions: Pat sees where Sam
// is typing, as a line at the letter with Sam's name, only in that one cell.
// Pat's own cursor goes out to teammates. Only a spot goes out, never the
// words. All made up.
const ROWS = [['Item', 'Price'], ['Bread', '4'], ['Pie', '9']];
const CAPTION = 'Made-up bake sale stall';
const WIN = {
  id: 'wr1', kind: 'officeDocs', x: 0, y: 0, w: 820, h: 560, title: 'Made-up plan',
  officeDoc: { order: ['t1', 'i1'] },
  'ob.t1': { type: 'table', at: 1, rows: ROWS },
  'ob.i1': { type: 'image', at: 2, src: 'data:image/png;base64,AA==', alt: CAPTION },
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

function openWriter(doc, win = WIN) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<OfficeDocsWindow win={win} onUpdate={() => {}} />);
  return { awareness };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const cell = (r, c) => screen.getByLabelText(`Row ${r + 1} column ${c + 1}`);
const caption = () => screen.getByLabelText('Picture caption');
const lineIn = (box) => box.parentElement.querySelector('.hb-text-caret[data-teammate-caret]');

function samAt(a, b, field, index) {
  const { awareness: pat } = openWriter(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'wr1', field, index) });
  expect(sam.getLocalState().caret).not.toBeNull();
  expect(JSON.stringify(sam.getLocalState().caret)).not.toMatch(/Bread|bake/);
  act(() => applyRemoteAwareness(pat, sam));
  return { pat, sam };
}

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a table cell's words and a caption are found as shared words", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'wr1', 'ob.t1/rows/1/0')?.toString()).toBe('Bread');
  expect(sharedText(a, 'wr1', 'ob.t1/rows/2/1')?.toString()).toBe('9');
  expect(sharedText(a, 'wr1', 'ob.i1/alt')?.toString()).toBe(CAPTION);
  expect(sharedText(a, 'wr1', 'ob.t1/rows/9/0')).toBeNull();
  expect(sharedText(a, 'wr1', 'ob.t1/rows')).toBeNull();
});

test("a teammate's cursor shows at the letter in the cell they type in, and only there", async () => {
  const { a, b } = twoDocs();
  samAt(a, b, 'ob.t1/rows/1/0', 3);
  await screen.findByText('Sam Example');
  expect(lineIn(cell(1, 0))).toHaveAttribute('data-at', '3');
  expect(lineIn(cell(1, 0))).toHaveAttribute('data-teammate-caret', 'Sam Example');
  expect(lineIn(cell(1, 1))).toBeNull();
  expect(lineIn(cell(2, 0))).toBeNull();
  expect(lineIn(caption())).toBeNull();
});

test("a teammate's cursor in a caption shows there, and moves when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  samAt(a, b, 'ob.i1/alt', 7);
  await screen.findByText('Sam Example');
  expect(lineIn(caption())).toHaveAttribute('data-at', '7');
  expect(lineIn(cell(1, 0))).toBeNull();
  act(() => { sharedText(b, 'wr1', 'ob.i1/alt').insert(0, 'Our '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(lineIn(caption())).toHaveAttribute('data-at', '11');
});

test('typing in a cell tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openWriter(a);
  jest.useFakeTimers();
  try {
    const box = cell(2, 0);
    act(() => { box.focus(); box.setSelectionRange(2, 2); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'wr1', field: 'ob.t1/rows/2/0' }));
    expect(JSON.stringify(sent)).not.toContain('Pie');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'wr1', 'ob.t1/rows/2/0')[0].index).toBe(2);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a document with no window sends no cursor from a cell', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  const { id, ...noId } = WIN;
  render(<OfficeDocsWindow win={noId} onUpdate={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = caption();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
