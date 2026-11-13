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
import { IdeaWindow } from '../src/components/IdeaWindow.jsx';
import { ideaBulletField } from '../src/components/idea/IdeaBullet.jsx';

// Live cursors in Idea Pad bullets: Pat sees where Sam is typing in a
// bullet, as a line with Sam's name at the letter, and only in that bullet.
// Pat's own cursor goes out to teammates. Only a spot goes out, never the
// words. All made up.
const BREAD = 'Fresh bread page';
const HOURS = 'Opening hours';
const WIN = { id: 'i1', kind: 'idea', x: 0, y: 0, w: 900, h: 600, ideas: [BREAD, HOURS], workItem: 'Sam Example Bakery' };
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

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'i1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bread');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}

const bullet = (n) => screen.getByRole('textbox', { name: `Idea bullet ${n}` });
const markIn = (n) => bullet(n).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a bullet's words are found as shared words", () => {
  const { a } = twoDocs();
  expect(ideaBulletField(1)).toBe('ideas/1');
  expect(sharedText(a, 'i1', ideaBulletField(0))?.toString()).toBe(BREAD);
  expect(sharedText(a, 'i1', ideaBulletField(5))).toBeNull();
});

test("a bullet shows a teammate's cursor with their name, and only that bullet", () => {
  const { a, b } = twoDocs();
  const pat = openIdeaPad(a);
  samAt(b, pat, ideaBulletField(0), 'Fresh'.length);
  expect(markIn(1)).toHaveAttribute('data-at', '5');
  expect(markIn(1)).toHaveTextContent('Sam Example');
  expect(markIn(2)).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Save tag' }).parentElement.querySelector('[data-teammate-caret]')).toBeNull();
});

test("a teammate's cursor moves with the words typed in front of it", () => {
  const { a, b } = twoDocs();
  const pat = openIdeaPad(a);
  samAt(b, pat, ideaBulletField(1), 'Opening'.length);
  act(() => {
    sharedText(b, 'i1', ideaBulletField(1)).insert(0, 'New: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(markIn(2)).toHaveAttribute('data-at', '12');
});

test('typing in a bullet tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openIdeaPad(a);
  jest.useFakeTimers();
  try {
    const box = bullet(2);
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'i1', field: 'ideas/1' }));
    expect(JSON.stringify(sent)).not.toContain('hours');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'i1', sent.field)[0].index).toBe(4);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, typing in a bullet sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<IdeaWindow win={WIN} onUpdate={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = bullet(1);
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
    expect(markIn(1)).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
