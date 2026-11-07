/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { IdeaWindow } from '../src/components/IdeaWindow.jsx';

// An Idea Pad's save tag ("Website Update") merges letter by letter: Pat and
// Sam typing in it at the same moment both keep what they typed, and each sees
// the other's letters as they type (before, it waited for a pause and the last
// writer's copy won). All words are made up.
const LOCAL = 'local';
const TAG = 'Sam Example Bakery site';
const board = (fields = {}) => ({
  wins: [{ id: 'i1', kind: 'idea', x: 0, y: 0, w: 900, h: 600, ideas: ['Fresh bread page'], workItem: TAG, ...fields }],
});

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board();
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const winOf = (doc, base) => readDocState(doc, base).wins[0];

afterEach(cleanup);

test('Pat and Sam typing in the save tag at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ workItem: `New: ${TAG}` }), LOCAL);
  writeStateToDoc(b, base, board({ workItem: `${TAG} update` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).workItem).toBe(`New: ${TAG} update`);
});

test('one person in the save tag and the other adding a bullet both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ workItem: `${TAG}!` }), LOCAL);
  writeStateToDoc(b, base, board({ ideas: ['Fresh bread page', 'Opening hours'] }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = winOf(doc, base);
    expect([win.workItem, win.ideas]).toEqual([`${TAG}!`, ['Fresh bread page', 'Opening hours']]);
  }
});

test('typing in the save tag hands each letter to the board at once', () => {
  const changes = [];
  const win = board().wins[0];
  render(<IdeaWindow win={win} onUpdate={(p) => changes.push(p)} currentProject={null} />);
  fireEvent.change(screen.getByLabelText('Save tag'), { target: { value: `${TAG}s` } });
  expect(changes).toContainEqual({ workItem: `${TAG}s` });
});

test("a teammate's letters show in the box and keep your cursor in place", () => {
  const win = board().wins[0];
  const { rerender } = render(<IdeaWindow win={win} onUpdate={() => {}} currentProject={null} />);
  const box = screen.getByLabelText('Save tag');
  act(() => { box.focus(); box.setSelectionRange(3, 3); });
  rerender(<IdeaWindow win={{ ...win, workItem: `Pat: ${TAG}` }} onUpdate={() => {}} currentProject={null} />);
  expect(box.value).toBe(`Pat: ${TAG}`);
  expect(box.selectionStart).toBe(8);
});

test('a bullet edit waiting to be saved does not send an old save tag back', () => {
  jest.useFakeTimers();
  try {
    const changes = [];
    const win = board().wins[0];
    const onUpdate = (p) => changes.push(p);
    const { rerender } = render(<IdeaWindow win={win} onUpdate={onUpdate} currentProject={null} />);
    fireEvent.change(screen.getByDisplayValue('Fresh bread page'), { target: { value: 'Fresh bread page now' } });
    rerender(<IdeaWindow win={{ ...win, workItem: `${TAG} (Sam)` }} onUpdate={onUpdate} currentProject={null} />);
    act(() => { jest.advanceTimersByTime(400); });
    const saved = changes.find((p) => Array.isArray(p.ideas));
    expect(saved.ideas).toEqual(['Fresh bread page now']);
    expect(changes.some((p) => 'workItem' in p)).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
