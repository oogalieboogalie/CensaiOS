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
import { ListingWriterWindow } from '../src/components/ListingWriterWindow.jsx';

// Live cursors in the Listing Writer form: Pat sees where Sam is typing in a
// box of the listing, as a line with Sam's name, and Pat's own cursor goes
// out to teammates. Each box is its own words, so a cursor in one box never
// shows in another. Only a spot in the words goes out, never the words.
// All made up.
const LISTING = { address: '14 Made-up Way', city: 'Exampleton', beds: '3', baths: '2', sqft: '1500', price: '415,000', features: 'Fenced yard, sunny porch', photos: [] };
const WIN = { id: 'lw1', kind: 'listingWriter', x: 0, y: 0, w: 720, h: 600, listing: LISTING };
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
  const view = render(<ListingWriterWindow win={win} onUpdate={() => {}} request={async () => ({})} />);
  return { awareness, view };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const featuresBox = () => screen.getByRole('textbox', { name: 'Features' });
const priceBox = () => screen.getByRole('textbox', { name: 'Price' });
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test('a box of the listing is found as shared words, and the photos are not', () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'lw1', 'listing/features')?.toString()).toBe(LISTING.features);
  expect(sharedText(a, 'lw1', 'listing/price')?.toString()).toBe(LISTING.price);
  expect(sharedText(a, 'lw1', 'listing/photos')).toBeNull();
  expect(sharedText(a, 'lw1', 'listing')).toBeNull();
});

test('every box keeps its own name, so a teammate tag never changes it', () => {
  openForm(twoDocs().a);
  for (const name of ['Address', 'Price', 'City', 'Beds', 'Baths', 'Sq ft', 'Features']) {
    expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
  }
});

test("a box shows a teammate's cursor with their name, and only that box", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openForm(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'lw1', 'listing/features', 'Fenced yard'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Fenced');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(featuresBox())).toHaveAttribute('data-at', '11');
  expect(markIn(priceBox())).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Features' })).toBe(featuresBox());
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openForm(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'lw1', 'listing/price', 3) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(priceBox())).toHaveAttribute('data-at', '3');
  const text = (doc) => sharedText(doc, 'lw1', 'listing/price');
  act(() => { text(b).insert(0, '$'); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(priceBox())).toHaveAttribute('data-at', '4');
});

test('typing in a box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openForm(a);
  jest.useFakeTimers();
  try {
    const box = featuresBox();
    act(() => { box.focus(); box.setSelectionRange(6, 6); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'lw1', field: 'listing/features' }));
    expect(JSON.stringify(sent)).not.toContain('Fenced');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'lw1', 'listing/features')[0].index).toBe(6);
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
  render(<ListingWriterWindow win={{ listing: LISTING }} onUpdate={() => {}} request={async () => ({})} />);
  jest.useFakeTimers();
  try {
    const box = featuresBox();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
