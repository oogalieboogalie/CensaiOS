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
import { LocalSitesWindow } from '../src/components/windows/localSites/index.jsx';
import { startSite } from '../src/lib/localSites/presets.js';

// Live cursors in the Local Sites form: Pat sees where Sam is typing in a box
// of the shop's website, as a line with Sam's name, and Pat's own cursor goes
// out to teammates. Each box is its own words, so a cursor in one box never
// shows in another. Only a spot in the words goes out, never the words.
// All made up.
const SITE = { ...startSite('bakery'), name: 'Sam Example Bakery', about: 'We bake bread every morning', phone: '555-0100' };
const WIN = { id: 'ls1', kind: 'localSites', x: 0, y: 0, w: 1080, h: 700, site: SITE };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openForm(doc, win = WIN) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<LocalSitesWindow win={win} onUpdate={() => {}} />);
  return { awareness };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const aboutBox = () => screen.getByRole('textbox', { name: 'About' });
const phoneBox = () => screen.getByRole('textbox', { name: 'Phone' });
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test('a box of the shop form is found as shared words, and the hours list is not', () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'ls1', 'site/about')?.toString()).toBe(SITE.about);
  expect(sharedText(a, 'ls1', 'site/phone')?.toString()).toBe(SITE.phone);
  expect(sharedText(a, 'ls1', 'site/hours')).toBeNull();
  expect(sharedText(a, 'ls1', 'site')).toBeNull();
});

test("a box shows a teammate's cursor with their name, and only that box", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openForm(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'ls1', 'site/about', 'We bake'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bake');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(aboutBox())).toHaveAttribute('data-at', '7');
  expect(markIn(phoneBox())).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openForm(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'ls1', 'site/phone', 3) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(phoneBox())).toHaveAttribute('data-at', '3');
  const text = (doc) => sharedText(doc, 'ls1', 'site/phone');
  act(() => { text(b).insert(0, '+1 '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(phoneBox())).toHaveAttribute('data-at', '6');
});

test('typing in a box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openForm(a);
  jest.useFakeTimers();
  try {
    const box = aboutBox();
    act(() => { box.focus(); box.setSelectionRange(2, 2); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'ls1', field: 'site/about' }));
    expect(JSON.stringify(sent)).not.toContain('bake');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'ls1', 'site/about')[0].index).toBe(2);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a form with no window sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  render(<LocalSitesWindow win={{ site: SITE }} onUpdate={() => {}} />);
  jest.useFakeTimers();
  try {
    const box = aboutBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
