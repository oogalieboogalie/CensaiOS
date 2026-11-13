/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { TodosWindow } from '../src/components/TodosWindow.jsx';

// A To-do list's words merge letter by letter: Pat and Sam fixing the words
// of the same to-do at the same moment both keep what they typed, and each
// letter reaches the board as it is typed (before, a to-do's words were
// swapped whole, and only on Enter, so the last one to save wiped out the
// other's letters). All words are made up.
const LOCAL = 'local';
const BREAD = 'Order rye flour';
const OVEN = 'Book the oven repair';
const todo = (id, text, extra = {}) => ({ id, text, done: false, assignee: null, ...extra });
const board = (items = [todo('t1', BREAD), todo('t2', OVEN)]) => ({
  wins: [{ id: 'w1', kind: 'todos', x: 0, y: 0, w: 320, h: 360, title: 'Sam Example Bakery', items }],
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

const textsOf = (doc, base) => readDocState(doc, base).wins[0].items.map((it) => it.text);

beforeEach(() => { global.fetch = jest.fn(async () => { throw new Error('offline'); }); });
afterEach(cleanup);

test('Pat and Sam typing in the same to-do at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([todo('t1', `Today: ${BREAD}`), todo('t2', OVEN)]), LOCAL);
  writeStateToDoc(b, base, board([todo('t1', `${BREAD}, two bags`), todo('t2', OVEN)]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(textsOf(doc, base)).toEqual([`Today: ${BREAD}, two bags`, OVEN]);
});

test('typing in one to-do while a teammate ticks it keeps both', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([todo('t1', `${BREAD}!`), todo('t2', OVEN)]), LOCAL);
  writeStateToDoc(b, base, board([todo('t1', BREAD, { done: true }), todo('t2', OVEN)]), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const [first] = readDocState(doc, base).wins[0].items;
    expect(first).toEqual(expect.objectContaining({ text: `${BREAD}!`, done: true }));
  }
});

test('typing in a to-do while a teammate adds another keeps both', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([todo('t1', `${BREAD}!`), todo('t2', OVEN)]), LOCAL);
  writeStateToDoc(b, base, board([todo('t1', BREAD), todo('t2', OVEN), todo('t3', 'Pat Example: call the mill')]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(textsOf(doc, base)).toEqual([`${BREAD}!`, OVEN, 'Pat Example: call the mill']);
});

test('typing in a to-do hands each letter to the board at once', () => {
  const changes = [];
  render(<TodosWindow win={board().wins[0]} onUpdate={(p) => changes.push(p)} currentProject={null} />);
  fireEvent.doubleClick(screen.getByText(OVEN));
  fireEvent.change(screen.getByLabelText('To-do words'), { target: { value: `${OVEN} ` } });
  expect(changes.at(-1).items.map((it) => it.text)).toEqual([BREAD, `${OVEN} `]);
});

test("a teammate's letters show in the to-do you are typing in and keep your cursor", () => {
  const win = board().wins[0];
  const { rerender } = render(<TodosWindow win={win} onUpdate={() => {}} currentProject={null} />);
  fireEvent.doubleClick(screen.getByText(BREAD));
  const box = screen.getByLabelText('To-do words');
  act(() => { box.focus(); box.setSelectionRange(5, 5); });
  rerender(<TodosWindow win={{ ...win, items: [todo('t1', `Now: ${BREAD}`), todo('t2', OVEN)] }} onUpdate={() => {}} currentProject={null} />);
  expect(box.value).toBe(`Now: ${BREAD}`);
  expect(box.selectionStart).toBe(10);
});

test('Escape puts back the words from before you started typing', () => {
  const win = board().wins[0];
  const changes = [];
  const onUpdate = (p) => changes.push(p);
  const { rerender } = render(<TodosWindow win={win} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.doubleClick(screen.getByText(OVEN));
  fireEvent.change(screen.getByLabelText('To-do words'), { target: { value: 'Oops' } });
  rerender(<TodosWindow win={{ ...win, items: changes.at(-1).items }} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.keyDown(screen.getByLabelText('To-do words'), { key: 'Escape' });
  expect(changes.at(-1).items.map((it) => it.text)).toEqual([BREAD, OVEN]);
});

test('Enter tidies the words and an empty to-do keeps its old words', () => {
  const win = board().wins[0];
  const changes = [];
  const onUpdate = (p) => changes.push(p);
  const { rerender } = render(<TodosWindow win={win} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.doubleClick(screen.getByText(OVEN));
  fireEvent.change(screen.getByLabelText('To-do words'), { target: { value: `  ${OVEN} today ` } });
  rerender(<TodosWindow win={{ ...win, items: changes.at(-1).items }} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.keyDown(screen.getByLabelText('To-do words'), { key: 'Enter' });
  expect(changes.at(-1).items.map((it) => it.text)).toEqual([BREAD, `${OVEN} today`]);
  rerender(<TodosWindow win={{ ...win, items: changes.at(-1).items }} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.doubleClick(screen.getByText(BREAD));
  fireEvent.change(screen.getByLabelText('To-do words'), { target: { value: '   ' } });
  fireEvent.keyDown(screen.getByLabelText('To-do words'), { key: 'Enter' });
  expect(changes.at(-1).items.map((it) => it.text)).toEqual([BREAD, `${OVEN} today`]);
});
