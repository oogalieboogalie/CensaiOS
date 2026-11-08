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
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { todoWordsField } from '../src/components/todos/TodoWords.jsx';

// Live cursors in a To-do list: Pat sees where Sam is typing in a to-do's
// words, as a line with Sam's name while Pat edits that to-do too, or as a
// name tag on the row while Pat only looks. Pat's own cursor goes out to
// teammates. A cursor in one to-do never shows in another. Only a spot goes
// out, never the words. All made up.
const BREAD = 'Order rye flour';
const OVEN = 'Book the oven repair';
const todo = (id, text) => ({ id, text, done: false, assignee: null });
const WIN = { id: 'w1', kind: 'todos', x: 0, y: 0, w: 320, h: 360, title: 'Sam Example Bakery', items: [todo('t1', BREAD), todo('t2', OVEN)] };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const FIRST = 'items/0/text';

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openList(doc, win = WIN) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<TodosWindow win={win} onUpdate={() => {}} currentProject={null} />);
  return { awareness };
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'w1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('flour');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
  return sam;
}

const edit = (words) => { fireEvent.doubleClick(screen.getByText(words)); return screen.getByLabelText('To-do words'); };
const markIn = (el) => el.parentElement.querySelector('[data-teammate-caret]');
const tagsOn = (words) => screen.getByText(words).parentElement.querySelectorAll('[data-teammate-caret]');

beforeEach(() => { global.fetch = jest.fn(async () => { throw new Error('offline'); }); });
afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a to-do's words are found as shared words, and nothing else is", () => {
  const { a } = twoDocs();
  expect(todoWordsField(WIN.items, 't2')).toBe('items/1/text');
  expect(todoWordsField(WIN.items, 'gone')).toBeNull();
  expect(todoWordsField(null, 't1')).toBeNull();
  expect(sharedText(a, 'w1', FIRST)?.toString()).toBe(BREAD);
  expect(sharedText(a, 'w1', 'items/0/done')).toBeNull();
  expect(sharedText(a, 'w1', 'items/5/text')).toBeNull();
});

test("editing a to-do shows a teammate's cursor in it with their name, and only in that one", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openList(a);
  samAt(b, pat, FIRST, 'Order'.length);
  const box = edit(BREAD);
  expect(markIn(box)).toHaveAttribute('data-at', '5');
  expect(markIn(box)).toHaveTextContent('Sam Example');
  expect(tagsOn(OVEN)).toHaveLength(0);
});

test('a to-do you only look at shows a name tag for a teammate typing in it', () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openList(a);
  samAt(b, pat, 'items/1/text', 2);
  expect(tagsOn(OVEN)).toHaveLength(1);
  expect(tagsOn(OVEN)[0]).toHaveTextContent('Sam Example');
  expect(tagsOn(BREAD)).toHaveLength(0);
});

test("a teammate's cursor moves with the words typed in front of it", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openList(a);
  samAt(b, pat, FIRST, 5);
  const box = edit(BREAD);
  act(() => {
    sharedText(b, 'w1', FIRST).insert(0, 'Now: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(markIn(box)).toHaveAttribute('data-at', '10');
});

test('typing in a to-do tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openList(a);
  const box = edit(OVEN);
  jest.useFakeTimers();
  try {
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'w1', field: 'items/1/text' }));
    expect(JSON.stringify(sent)).not.toContain('oven');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'w1', sent.field)[0].index).toBe(4);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, editing a to-do sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<TodosWindow win={WIN} onUpdate={() => {}} currentProject={null} />);
  const box = edit(BREAD);
  jest.useFakeTimers();
  try {
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
    expect(markIn(box)).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
