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
import { slideBoxField } from '../src/components/office/slides/SlideBoxCarets.jsx';

// Live cursors in the words of a slide's text boxes: Pat sees where Sam is
// typing in a box. While Pat types in the same box, it is a line with Sam's
// name at the letter; otherwise a name tag on the box. Only that box, only
// that slide. Pat's own cursor goes out to teammates. Only a spot goes out,
// never the words. All made up.
const TITLE = 'Made-up cover';
const BODY = 'Fresh bread every morning';
const block = (id, text, y) => ({ id, type: 'text', x: 6, y, w: 88, h: 16, text });
const slide = (blocks, at) => ({ layout: 'titleBody', blocks, notes: '', at });
const WIN = {
  id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, title: 'Made-up pitch',
  officeDeck: { order: ['s1', 's2'], theme: 'censai' },
  'os.s1': slide([block('t1', TITLE, 7), block('b1', BODY, 40)], 1),
  'os.s2': slide([block('t2', 'Made-up plan', 7)], 2),
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
  return awareness;
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'sl1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bread');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}

const stage = () => screen.getByRole('group', { name: 'Slide editor' });
const boxOf = (words) => [...stage().querySelectorAll('.hb-of-sblock')].find((el) => el.textContent.includes(words));
const editBox = (words) => { fireEvent.doubleClick(boxOf(words)); return screen.getByRole('textbox', { name: 'Slide text' }); };
const markIn = (el) => el.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a slide box's words are found as shared words", () => {
  const { a } = twoDocs();
  expect(slideBoxField('s1', 1)).toBe('os.s1/blocks/1/text');
  expect(sharedText(a, 'sl1', slideBoxField('s1', 0))?.toString()).toBe(TITLE);
  expect(sharedText(a, 'sl1', slideBoxField('s1', 1))?.toString()).toBe(BODY);
  expect(sharedText(a, 'sl1', slideBoxField('s1', 4))).toBeNull();
});

test("a box shows a name tag for a teammate typing in it, and only that box", () => {
  const { a, b } = twoDocs();
  const pat = openDeck(a);
  samAt(b, pat, slideBoxField('s1', 1), 'Fresh'.length);
  expect(markIn(boxOf(BODY))).toHaveTextContent('Sam Example');
  expect(markIn(boxOf(TITLE))).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }));
  expect(screen.queryByText('Sam Example')).toBeNull();
});

test("typing in the same box, Pat sees Sam's cursor at the letter, and it moves with the words", () => {
  const { a, b } = twoDocs();
  const pat = openDeck(a);
  samAt(b, pat, slideBoxField('s1', 1), 'Fresh'.length);
  const box = editBox(BODY);
  expect(markIn(box.parentElement)).toHaveAttribute('data-at', '5');
  expect(markIn(box.parentElement)).toHaveTextContent('Sam Example');
  act(() => {
    sharedText(b, 'sl1', slideBoxField('s1', 1)).insert(0, 'New: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(markIn(box.parentElement)).toHaveAttribute('data-at', '10');
});

test('typing in a box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openDeck(a);
  jest.useFakeTimers();
  try {
    const box = editBox(TITLE);
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'sl1', field: 'os.s1/blocks/0/text' }));
    expect(JSON.stringify(sent)).not.toContain('cover');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'sl1', sent.field)[0].index).toBe(4);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, typing in a box sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<OfficeSlidesWindow win={WIN} onUpdate={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = editBox(TITLE);
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
