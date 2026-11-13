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
import { StepStack } from '../src/components/windows/stepCards/StepStack.jsx';
import { reportFieldOf, stepReportField } from '../src/components/windows/stepCards/reportField.js';

// Live cursors in a Step cards answer box ("what the helper said"): Pat sees
// where Sam is typing, as a line with Sam's name at the letter, only in that
// step's answer. Pat's own cursor goes out to teammates. Only a spot goes
// out, never the words. All made up.
const SAID = 'Sam Example sanded the shelf';
const OILED = 'Pat Example oiled it';
const step = (id, report) => ({
  id, title: `Made-up step ${id}`, text: '', done: false, report,
  checks: [{ id: `${id}-c`, kind: 'ask', words: 'The shelf is smooth', state: 'open', line: '' }],
});
const CARDS = [
  { id: 'c0', title: 'Made-up other card', assignee: null, steps: [step('x1', 'Other words')] },
  { id: 'c1', title: 'Made-up shelf', assignee: null, steps: [step('s1', SAID), step('s2', OILED)] },
];
const WIN = { id: 'sc1', kind: 'stepCards', x: 0, y: 0, w: 960, h: 620, cards: CARDS };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const FIELD = 'cards/1/steps/0/report';
const sc = () => ({ busy: null, send: jest.fn(), check: jest.fn(), setReport: jest.fn() });

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openCard(doc, winId = 'sc1') {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<StepStack card={CARDS[1]} sc={sc()} winId={winId} rawCards={CARDS} />);
  return awareness;
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'sc1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('sanded');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}

const box = () => screen.getByRole('textbox');
const mark = () => box().parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a step's answer is found as shared words, by card and step", () => {
  const { a } = twoDocs();
  expect(stepReportField(1, 0)).toBe(FIELD);
  expect(reportFieldOf(CARDS, 'c1', 's2')).toBe('cards/1/steps/1/report');
  expect(reportFieldOf(CARDS, 'c1', 'nope')).toBeNull();
  expect(reportFieldOf(undefined, 'c1', 's1')).toBeNull();
  expect(sharedText(a, 'sc1', FIELD)?.toString()).toBe(SAID);
});

test("the answer box shows a teammate's cursor with their name, only for that step", () => {
  const { a, b } = twoDocs();
  const pat = openCard(a);
  samAt(b, pat, FIELD, 'Sam Example'.length);
  expect(mark()).toHaveAttribute('data-at', '11');
  expect(mark()).toHaveTextContent('Sam Example');
  cleanup();
  const other = openCard(a);
  samAt(b, other, 'cards/0/steps/0/report', 2);
  expect(mark()).toBeNull();
});

test("a teammate's cursor moves with the words typed in front of it", () => {
  const { a, b } = twoDocs();
  const pat = openCard(a);
  samAt(b, pat, FIELD, 'Sam'.length);
  act(() => {
    sharedText(b, 'sc1', FIELD).insert(0, 'Done: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(mark()).toHaveAttribute('data-at', '9');
});

test('typing in the answer tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openCard(a);
  jest.useFakeTimers();
  try {
    const el = box();
    act(() => { el.focus(); el.setSelectionRange(4, 4); fireEvent.keyUp(el, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'sc1', field: FIELD }));
    expect(JSON.stringify(sent)).not.toContain('sanded');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'sc1', sent.field)[0].index).toBe(4);
    act(() => { el.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, typing in the answer sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<StepStack card={CARDS[1]} sc={sc()} />);
  jest.useFakeTimers();
  try {
    const el = box();
    act(() => { el.focus(); fireEvent.keyUp(el, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
    expect(mark()).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
