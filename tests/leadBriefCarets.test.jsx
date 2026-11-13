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
import { BriefForm } from '../src/components/leadhound/BriefForm.jsx';

// Live cursors in the LeadHound brief: Pat sees where Sam is typing in a box
// of the brief, as a line with Sam's name, and Pat's own cursor goes out to
// teammates. Each box is its own words, so a cursor in one box never shows in
// another. Only a spot in the words goes out, never the words. All made up.
const BRIEF = { business: 'Sam Example Bakery bread', market: 'Small cafes', region: 'Exampleton', maxLeads: 3 };
const WIN = { id: 'h1', kind: 'leadHound', x: 0, y: 0, w: 1000, h: 720, leadBrief: BRIEF };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openBrief(doc, brief = BRIEF) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  const view = render(<BriefForm brief={brief} onChange={() => {}} running={false} onSubmit={() => {}} windowId="h1" />);
  return { awareness, view };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const businessBox = () => screen.getByLabelText('Your service or business');
const marketBox = () => screen.getByLabelText('Target market');
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test('a box of the brief is found as shared words, and nothing else is', () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'h1', 'leadBrief/business')?.toString()).toBe(BRIEF.business);
  expect(sharedText(a, 'h1', 'leadBrief/maxLeads')).toBeNull();
  expect(sharedText(a, 'h1', 'leadBrief/business/x')).toBeNull();
  expect(sharedText(a, 'h1', 'leadBrief')).toBeNull();
  expect(sharedText(a, 'h1', '/business')).toBeNull();
});

test("a box shows a teammate's cursor with their name, and only that box", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openBrief(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'h1', 'leadBrief/business', 'Sam Example'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(businessBox())).toHaveAttribute('data-at', '11');
  expect(markIn(marketBox())).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openBrief(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'h1', 'leadBrief/market', 5) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(marketBox())).toHaveAttribute('data-at', '5');
  const text = (doc) => sharedText(doc, 'h1', 'leadBrief/market');
  act(() => { text(b).insert(0, 'New: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(marketBox())).toHaveAttribute('data-at', '10');
});

test('typing in a box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openBrief(a);
  jest.useFakeTimers();
  try {
    const box = businessBox();
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'h1', field: 'leadBrief/business' }));
    expect(JSON.stringify(sent)).not.toContain('Bakery');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'h1', 'leadBrief/business')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a brief with no window sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  render(<BriefForm brief={BRIEF} onChange={() => {}} running={false} onSubmit={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = businessBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
