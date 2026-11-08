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

// Live cursors in Writer paragraphs: Pat sees where Sam is typing. In the
// paragraph Pat is typing in too, Sam's cursor is a line at the letter with
// Sam's name; in a paragraph Pat is only reading, Sam's name shows as a tag
// on that paragraph. Pat's own cursor goes out to teammates. Each paragraph
// is its own words, so Sam in paragraph 1 never shows on paragraph 2. Only a
// spot goes out, never the words. All made up.
const P1 = 'Made-up plan for the bake sale.';
const P2 = 'Sam Example brings the oven.';
const para = (text, at) => ({ type: 'p', text, at });
const WIN = {
  id: 'wr1', kind: 'officeDocs', x: 0, y: 0, w: 820, h: 560, title: 'Made-up plan',
  officeDoc: { order: ['b1', 'b2'] }, 'ob.b1': para(P1, 1), 'ob.b2': para(P2, 2),
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

const paragraph = (words) => screen.getByText(words).closest('.hb-of-block');
const tagIn = (block) => block.querySelector('.hb-of-here [data-teammate-caret]');
const typingBox = () => document.querySelector('textarea.hb-of-text');
const lineIn = (box) => box.parentElement.querySelector('.hb-text-caret[data-teammate-caret]');
const openParagraph = (words) => act(() => { fireEvent.mouseDown(screen.getByText(words)); });

function samAt(a, b, block, index) {
  const { awareness: pat } = openWriter(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'wr1', `ob.${block}/text`, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bake');
  act(() => applyRemoteAwareness(pat, sam));
  return { pat, sam };
}

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a paragraph's words are found as shared words, and the paragraph itself is not", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'wr1', 'ob.b1/text')?.toString()).toBe(P1);
  expect(sharedText(a, 'wr1', 'ob.b2/text')?.toString()).toBe(P2);
  expect(sharedText(a, 'wr1', 'ob.b1/type')).toBeNull();
  expect(sharedText(a, 'wr1', 'ob.b1')).toBeNull();
});

test("a paragraph I am reading shows a teammate's name tag, only on that paragraph", async () => {
  const { a, b } = twoDocs();
  samAt(a, b, 'b1', 'Made-up'.length);
  await screen.findByText('Sam Example');
  expect(tagIn(paragraph(P1))).toHaveAttribute('data-at', '7');
  expect(tagIn(paragraph(P1))).toHaveAttribute('data-teammate-caret', 'Sam Example');
  expect(tagIn(paragraph(P2))).toBeNull();
});

test("the paragraph I am typing in shows the teammate's cursor at the letter", async () => {
  const { a, b } = twoDocs();
  samAt(a, b, 'b1', 'Made-up'.length);
  await screen.findByText('Sam Example');
  openParagraph(P1);
  expect(typingBox()).toHaveValue(P1);
  expect(lineIn(typingBox())).toHaveAttribute('data-at', '7');
  expect(document.querySelector('.hb-of-here')).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  samAt(a, b, 'b1', 4);
  await screen.findByText('Sam Example');
  openParagraph(P1);
  expect(lineIn(typingBox())).toHaveAttribute('data-at', '4');
  const text = (doc) => sharedText(doc, 'wr1', 'ob.b1/text');
  act(() => { text(b).insert(0, 'Pat: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(lineIn(typingBox())).toHaveAttribute('data-at', '9');
});

test('typing in a paragraph tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openWriter(a);
  openParagraph(P2);
  jest.useFakeTimers();
  try {
    const box = typingBox();
    act(() => { box.focus(); box.setSelectionRange(3, 3); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'wr1', field: 'ob.b2/text' }));
    expect(JSON.stringify(sent)).not.toContain('oven');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'wr1', 'ob.b2/text')[0].index).toBe(3);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a document with no window sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  const { id, ...noId } = WIN;
  render(<OfficeDocsWindow win={noId} onUpdate={() => {}} />);
  openParagraph(P1);
  jest.useFakeTimers();
  try {
    const box = typingBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
