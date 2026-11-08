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
import { LeadDetail } from '../src/components/leadhound/LeadDetail.jsx';

// Live cursors in LeadHound drafts: Pat sees where Sam is typing in a lead's
// day-by-day messages and ice breaker, as a line with Sam's name, and Pat's
// own cursor goes out to teammates. Each draft is its own words, so a cursor
// in Day 1 never shows in Day 2, and one in lead 2 never shows in lead 1.
// Only a spot goes out, never the words. All made up.
const lead = (company, n) => ({
  company, url: `https://example.com/${n}`, host: 'example.com', fitScore: 80,
  sequence: [
    { day: 1, channel: 'email', subject: `Hello ${company}`, body: 'Fresh bread for your made-up cafe.' },
    { day: 3, channel: 'email', subject: 'Following up', body: 'Just checking in about the bread.' },
  ],
  iceBreaker: { title: 'Free tasting', format: 'offer', opening_line: 'We bake nearby.', deliverable: 'A box of rolls.', cta: 'Can I drop by?' },
});
const LEADS = [lead('Example Cafe', 1), lead('Sample Diner', 2)];
const WIN = { id: 'h1', kind: 'leadHound', x: 0, y: 0, w: 1000, h: 720, leadHound: { brief: null, result: { leads: LEADS } } };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const DAY1 = 'leadHound/result/leads/0/sequence/0/body';

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openLead(doc, { windowId = 'h1', leadIndex = 0 } = {}) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<LeadDetail lead={LEADS[leadIndex]} onBank={async () => ({})} windowId={windowId} leadIndex={leadIndex} />);
  return { awareness };
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'h1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bread');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
  return sam;
}

const box = (name) => screen.getByLabelText(name);
const markIn = (el) => el.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a lead's drafts are found as shared words, and nothing else is", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'h1', DAY1)?.toString()).toBe(LEADS[0].sequence[0].body);
  expect(sharedText(a, 'h1', 'leadHound/result/leads/1/iceBreaker/cta')?.toString()).toBe('Can I drop by?');
  expect(sharedText(a, 'h1', 'leadHound/result/leads/0/sequence/0/day')).toBeNull();
  expect(sharedText(a, 'h1', 'leadHound/result/leads/0/company')).toBeNull();
  expect(sharedText(a, 'h1', 'leadHound/result/leads/9/sequence/0/body')).toBeNull();
  expect(sharedText(a, 'h1', 'leadHound/result/leads/00/sequence/0/body')).toBeNull();
  expect(sharedText(a, 'h1', `${DAY1}/x`)).toBeNull();
  expect(sharedText(a, 'h1', 'leadHound//result')).toBeNull();
});

test("a day's message shows a teammate's cursor with their name, and only that day", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openLead(a);
  samAt(b, pat, DAY1, 'Fresh'.length);
  expect(markIn(box('Day 1 message'))).toHaveAttribute('data-at', '5');
  expect(markIn(box('Day 1 message'))).toHaveTextContent('Sam Example');
  expect(markIn(box('Day 3 message'))).toBeNull();
  expect(markIn(box('Day 1 subject'))).toBeNull();
});

test("a cursor in another lead's drafts does not show in this lead", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openLead(a);
  samAt(b, pat, 'leadHound/result/leads/1/sequence/0/body', 3);
  expect(markIn(box('Day 1 message'))).toBeNull();
});

test("the ice breaker shows a teammate's cursor, and it moves with the words", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openLead(a);
  const field = 'leadHound/result/leads/0/iceBreaker/cta';
  samAt(b, pat, field, 4);
  fireEvent.click(screen.getByRole('button', { name: 'Ice breaker' }));
  expect(markIn(box('Ask'))).toHaveAttribute('data-at', '4');
  act(() => {
    sharedText(b, 'h1', field).insert(0, 'Pat: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(markIn(box('Ask'))).toHaveAttribute('data-at', '9');
});

test('typing in a draft tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openLead(a, { leadIndex: 1 });
  jest.useFakeTimers();
  try {
    const el = box('Day 3 subject');
    act(() => { el.focus(); el.setSelectionRange(2, 2); fireEvent.keyUp(el, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'h1', field: 'leadHound/result/leads/1/sequence/1/subject' }));
    expect(JSON.stringify(sent)).not.toContain('Following');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'h1', sent.field)[0].index).toBe(2);
    act(() => { el.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a lead shown with no window sends no cursor', () => {
  const { a } = twoDocs();
  const { awareness } = openLead(a, { windowId: null });
  jest.useFakeTimers();
  try {
    const el = box('Day 1 message');
    act(() => { el.focus(); fireEvent.keyUp(el, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
