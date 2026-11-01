/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { anchorNote, noteWords } from '../src/components/doc/anchorNotes.js';
import { DocWindow } from '../src/components/DocWindow.jsx';
import { useDoc } from '../src/components/doc/useDoc.js';

const PLAN = 'Made-up plan: we meet at noon by the old mill.';
const at = PLAN.indexOf('old mill');
const note = { id: 'n1', kind: 'comment', start: at, end: at + 8, quote: 'old mill', body: 'Made-up comment', ...noteWords(PLAN, at, at + 8) };
const wordsOf = (text, ann) => text.slice(ann.start, ann.end);

test('a comment follows its words when a line is added above them', () => {
  const text = `Made-up line added on top.\n${PLAN}`;
  const placed = anchorNote(text, note);
  expect(wordsOf(text, placed)).toBe('old mill');
  expect(placed.lost).toBeUndefined();
});

test('a comment whose words were deleted is marked lost instead of painting other words', () => {
  expect(anchorNote(PLAN.replace('old mill', 'new barn'), note)).toMatchObject({ lost: true });
});

test('when the same words appear twice, the comment stays on the copy with its neighbours', () => {
  const text = `Made-up note: the old mill is far. ${PLAN}`;
  const placed = anchorNote(text, note);
  expect(placed.start).toBe(text.indexOf('by the old mill') + 'by the '.length);
});

test('a change right next to the words keeps the comment on them', () => {
  const text = PLAN.replace('noon', 'one o\'clock');
  expect(wordsOf(text, anchorNote(text, note))).toBe('old mill');
});

test('an older comment saved without its exact words keeps its saved place when it cannot be found', () => {
  const old = { id: 'n2', kind: 'comment', start: 2, end: 6, quote: 'Bold w' };
  expect(anchorNote('**Bold** words', old)).toBe(old);
});

test('an older comment saved without context still follows its words, to the nearest copy', () => {
  const old = { id: 'n3', kind: 'comment', start: at, end: at + 8, quote: 'old mill' };
  const text = `Made-up line added on top.\n${PLAN}`;
  expect(wordsOf(text, anchorNote(text, old))).toBe('old mill');
});

function open(win) {
  const onUpdate = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
  render(<DocWindow win={{ kind: 'doc', ...win }} onUpdate={onUpdate} onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  return onUpdate;
}

test('a click on commented words that moved still opens their comment', () => {
  const text = `Made-up line added on top.\n\n${PLAN}`;
  const onUpdate = open({ id: 'moved-doc', text, annotations: [note] });
  const node = screen.getByText(PLAN).firstChild;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(node, PLAN.indexOf('old mill') + 2);
  range.collapse(true);
  sel.addRange(range);
  fireEvent.mouseUp(node.parentElement);
  expect(onUpdate).toHaveBeenCalledWith({ showComments: true });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('the comment card says when its words were deleted', () => {
  open({ id: 'lost-doc', text: PLAN.replace('old mill', 'new barn'), annotations: [note], showComments: true });
  expect(screen.getByText('Its words were deleted from the page.')).toBeVisible();
});

function FirstLook({ win, seen }) {
  const doc = useDoc(win, jest.fn(), jest.fn(), jest.fn(), { current: null });
  seen.push({ text: doc.text, lost: doc.placedNotes.filter((n) => n.lost).length });
  return null;
}

test('a Document has its words, and its comments their places, from the very first look', () => {
  const seen = [];
  render(<FirstLook win={{ id: 'first-look', kind: 'doc', text: PLAN, annotations: [note] }} seen={seen} />);
  expect(seen[0]).toEqual({ text: PLAN, lost: 0 });
});
