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
import { boardToCopy, copyToBoard } from '../src/lib/collaboration/draftCarets.js';
import { CadCode } from '../src/components/yorware/cad/CadCode.jsx';

// Live cursors in a CAD recipe: Pat sees where Sam is in the recipe, as a
// line with Sam's name, and Pat's own cursor goes out while Pat is in the
// box. Pat's box can hold an unsaved copy, so spots are matched between the
// copy and the board's recipe. Only a spot goes out, never the words.
// All people and words are made up.
const RECIPE = 'const params = [];\nfunction main(r) { return r.box(10); }';
const WIN = { id: 'cad1', kind: 'yorCad', x: 0, y: 0, w: 800, h: 500, cadCode: RECIPE };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const MAIN = RECIPE.indexOf('function');

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

const cadWith = (code) => ({
  code, board: { code: RECIPE }, dirty: code !== RECIPE, canEdit: true,
  setDraft: jest.fn(), runDraft: jest.fn(), discardDraft: jest.fn(), startFrom: jest.fn(),
});

function openRecipe(doc, code = RECIPE) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<CadCode cad={cadWith(code)} winId="cad1" />);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the recipe shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openRecipe(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'cad1', 'cadCode', MAIN) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('function');
  act(() => applyRemoteAwareness(pat, sam));
  const mark = await screen.findByText('Sam Example');
  expect(mark.closest('[data-teammate-caret]')).toHaveAttribute('data-at', String(MAIN));
});

test("with my own unsaved lines on top, a teammate's cursor still lands on the same words", async () => {
  const { a, b } = twoDocs();
  const mine = '// my made-up note\n';
  const pat = openRecipe(a, mine + RECIPE);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'cad1', 'cadCode', MAIN) });
  act(() => applyRemoteAwareness(pat, sam));
  const mark = await screen.findByText('Sam Example');
  expect(mark.closest('[data-teammate-caret]')).toHaveAttribute('data-at', String(mine.length + MAIN));
});

test('being in the recipe tells teammates where my cursor is on the board, and leaving takes it away', () => {
  jest.useFakeTimers();
  try {
    const { a } = twoDocs();
    const mine = '// my made-up note\n';
    const awareness = openRecipe(a, mine + RECIPE);
    const box = screen.getByRole('textbox', { name: 'Recipe code' });
    act(() => { box.focus(); box.setSelectionRange(mine.length + MAIN, mine.length + MAIN); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'cad1', field: 'cadCode' }));
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'cad1', 'cadCode')[0].index).toBe(MAIN);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('spots match up between an unsaved copy and the board', () => {
  const board = 'abcdef';
  const copy = 'abXYcdef';
  expect(copyToBoard(1, copy, board)).toBe(1);
  expect(copyToBoard(6, copy, board)).toBe(4);
  expect(copyToBoard(3, copy, board)).toBe(2); // inside my own new words: the edge of the change
  expect(boardToCopy(4, board, copy)).toBe(6);
  expect(boardToCopy(2, board, copy)).toBe(2); // right where the new words start
  expect(copyToBoard(3, board, board)).toBe(3);
});
