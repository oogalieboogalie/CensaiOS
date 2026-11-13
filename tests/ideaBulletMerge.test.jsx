/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { IdeaWindow } from '../src/components/IdeaWindow.jsx';

// An Idea Pad's bullets merge letter by letter: Pat and Sam typing in the
// same bullet at the same moment both keep what they typed, and each sees
// the other's letters as they type (before, the bullet was swapped whole, so
// it came out doubled or lost someone's letters, and a bullet you were
// changing could be added a second time when a teammate's change arrived).
// All words are made up.
const LOCAL = 'local';
const BREAD = 'Fresh bread page';
const HOURS = 'Opening hours';
const board = (ideas = [BREAD, HOURS], fields = {}) => ({
  wins: [{ id: 'i1', kind: 'idea', x: 0, y: 0, w: 900, h: 600, ideas, workItem: 'Sam Example Bakery', ...fields }],
});

function startBoth(base = board()) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const ideasOf = (doc, base) => readDocState(doc, base).wins[0].ideas;

afterEach(cleanup);

test('Pat and Sam typing in the same bullet at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([`Big ${BREAD}`, HOURS]), LOCAL);
  writeStateToDoc(b, base, board([`${BREAD} with photos`, HOURS]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(ideasOf(doc, base)).toEqual([`Big ${BREAD} with photos`, HOURS]);
});

test('typing on after a teammate letters landed keeps merging', () => {
  const { a, b, sync, base } = startBoth();
  const one = board([`Big ${BREAD}`, HOURS]);
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  const seen = readDocState(b, base);
  writeStateToDoc(b, seen, board([`Big ${BREAD} now`, HOURS]), LOCAL);
  writeStateToDoc(a, one, board([`Big ${BREAD}`, `${HOURS} on Sunday`]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(ideasOf(doc, base)).toEqual([`Big ${BREAD} now`, `${HOURS} on Sunday`]);
});

test('one person typing in a bullet while the other adds a bullet keeps both', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([`${BREAD}!`, HOURS]), LOCAL);
  writeStateToDoc(b, base, board([BREAD, HOURS, 'Gift cards']), LOCAL);
  sync();
  for (const doc of [a, b]) expect(ideasOf(doc, base)).toEqual([`${BREAD}!`, HOURS, 'Gift cards']);
});

test('one person typing in a bullet while the other removes another keeps both', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([`${BREAD}!`, HOURS]), LOCAL);
  writeStateToDoc(b, base, board([BREAD]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(ideasOf(doc, base)).toEqual([`${BREAD}!`]);
});

test('two bullets with the same words stay two bullets when one changes', () => {
  const { a, b, sync, base } = startBoth(board([HOURS, HOURS]));
  writeStateToDoc(a, base, board([HOURS, `${HOURS}?`]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(ideasOf(doc, base)).toEqual([HOURS, `${HOURS}?`]);
});

test('typing in a bullet hands each letter to the board at once', () => {
  const changes = [];
  render(<IdeaWindow win={board().wins[0]} onUpdate={(p) => changes.push(p)} currentProject={null} />);
  fireEvent.change(screen.getByLabelText('Idea bullet 2'), { target: { value: `${HOURS}.` } });
  expect(changes).toContainEqual(expect.objectContaining({ ideas: [BREAD, `${HOURS}.`] }));
});

test("a teammate's letters show in the bullet, keep your cursor, and add no copy", () => {
  const win = board().wins[0];
  const changes = [];
  const { rerender } = render(<IdeaWindow win={win} onUpdate={(p) => changes.push(p)} currentProject={null} />);
  const box = screen.getByLabelText('Idea bullet 1');
  act(() => { box.focus(); box.setSelectionRange(5, 5); });
  rerender(<IdeaWindow win={{ ...win, ideas: [`Big ${BREAD}`, HOURS] }} onUpdate={(p) => changes.push(p)} currentProject={null} />);
  expect(box.value).toBe(`Big ${BREAD}`);
  expect(box.selectionStart).toBe(9);
  expect(screen.getAllByLabelText(/^Idea bullet/)).toHaveLength(2);
});
