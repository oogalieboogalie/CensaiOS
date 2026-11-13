/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { StepStack } from '../src/components/windows/stepCards/StepStack.jsx';

// A Step cards window's answer box ("what the helper said") merges letter by
// letter, and a card's steps merge step by step: Pat and Sam typing in it at
// the same moment both keep what they typed, and Pat filling in one step
// while Sam changes another keeps both (before, the answer was saved only on
// click-away, and the last one to change the card won). All words are made up.
const LOCAL = 'local';
const SAID = 'Sam Example sanded the made-up shelf';
const step = (id, extra = {}) => ({
  id, title: `Made-up step ${id}`, text: '', done: false,
  checks: [{ id: `${id}-c`, kind: 'ask', words: 'The shelf is smooth', state: 'open', line: '' }], ...extra,
});
const card = (steps) => ({ id: 'c1', title: 'Made-up shelf', assignee: null, steps });
const board = (steps = [step('s1', { report: SAID }), step('s2')]) => ({
  wins: [{ id: 'sc1', kind: 'stepCards', x: 0, y: 0, w: 960, h: 620, cards: [card(steps)] }],
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

const stepsOf = (doc, base) => readDocState(doc, base).wins[0].cards[0].steps;

afterEach(cleanup);

test('Pat and Sam typing in one answer at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([step('s1', { report: `Done: ${SAID}` }), step('s2')]), LOCAL);
  writeStateToDoc(b, base, board([step('s1', { report: `${SAID} twice` }), step('s2')]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(stepsOf(doc, base)[0].report).toBe(`Done: ${SAID} twice`);
});

test('typing a second time still merges (the answer stays merging text)', () => {
  const { a, b, sync, base } = startBoth();
  const once = board([step('s1', { report: `${SAID}.` }), step('s2')]);
  writeStateToDoc(a, base, once, LOCAL);
  sync();
  writeStateToDoc(a, once, board([step('s1', { report: `Pat: ${SAID}.` }), step('s2')]), LOCAL);
  writeStateToDoc(b, once, board([step('s1', { report: `${SAID}. Sam` }), step('s2')]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(stepsOf(doc, base)[0].report).toBe(`Pat: ${SAID}. Sam`);
});

test('one person typing an answer and the other changing another step both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([step('s1', { report: `${SAID}!` }), step('s2')]), LOCAL);
  writeStateToDoc(b, base, board([step('s1', { report: SAID }), step('s2', { report: 'Pat Example oiled it' })]), LOCAL);
  sync();
  for (const doc of [a, b]) {
    expect(stepsOf(doc, base).map((s) => s.report)).toEqual([`${SAID}!`, 'Pat Example oiled it']);
  }
});

test('typing in the answer box hands each letter to the board at once', () => {
  const sc = { busy: null, send: jest.fn(), check: jest.fn(), setReport: jest.fn() };
  render(<StepStack card={board().wins[0].cards[0]} sc={sc} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: `${SAID}.` } });
  expect(sc.setReport).toHaveBeenCalledWith('c1', 's1', `${SAID}.`);
});

test("a teammate's letters show in the box and keep your cursor in place", () => {
  const sc = { busy: null, send: jest.fn(), check: jest.fn(), setReport: jest.fn() };
  const { rerender } = render(<StepStack card={board().wins[0].cards[0]} sc={sc} />);
  const box = screen.getByRole('textbox');
  act(() => { box.focus(); box.setSelectionRange(3, 3); });
  rerender(<StepStack card={card([step('s1', { report: `Pat: ${SAID}` }), step('s2')])} sc={sc} />);
  expect(box.value).toBe(`Pat: ${SAID}`);
  expect(box.selectionStart).toBe(8);
});

test('clicking away no longer sends an old copy of the answer back', () => {
  const sc = { busy: null, send: jest.fn(), check: jest.fn(), setReport: jest.fn() };
  const { rerender } = render(<StepStack card={board().wins[0].cards[0]} sc={sc} />);
  const box = screen.getByRole('textbox');
  act(() => { box.focus(); });
  rerender(<StepStack card={card([step('s1', { report: `${SAID} (Sam)` }), step('s2')])} sc={sc} />);
  act(() => { box.blur(); });
  fireEvent.click(screen.getByRole('button', { name: 'Check this step' }));
  expect(sc.setReport).not.toHaveBeenCalled();
  expect(sc.check.mock.calls[0][1].report).toBe(`${SAID} (Sam)`);
});
