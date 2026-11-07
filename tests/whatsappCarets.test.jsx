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
import { caretState, readTextCarets, setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { WhatsAppWindow } from '../src/components/WhatsAppWindow.jsx';

// Live cursors in the WhatsApp quick message: Pat sees where Sam is typing,
// as a line with Sam's name, and Pat's own cursor goes out to teammates. Only
// a spot in the shared words goes out, never the words. All made up.
const MSG = 'Hi Sam Example, the rye loaves are ready';
const WIN = { id: 'wa1', kind: 'whatsapp', x: 0, y: 0, w: 420, h: 560, contacts: [], draft: MSG };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openWhatsApp(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<WhatsAppWindow win={WIN} onUpdate={() => {}} />);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = () => screen.getByRole('textbox', { name: 'Message' }).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the message shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openWhatsApp(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'wa1', 'draft', 'Hi Sam Example'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('loaves');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn()).toHaveAttribute('data-at', '14');
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = openWhatsApp(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'wa1', 'draft', 14) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  const text = (doc) => doc.getMap('canvas').get('windows').get('wa1').get('draft');
  act(() => { text(b).insert(0, 'Morning! '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn()).toHaveAttribute('data-at', '23');
});

test("a teammate's cursor in another field does not show in the message", async () => {
  const { a, b } = twoDocs();
  const pat = openWhatsApp(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'wa1', 'title', 2) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn()).toBeNull();
});

test('typing in the message tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openWhatsApp(a);
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: 'Message' });
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'wa1', field: 'draft' }));
    expect(JSON.stringify(sent)).not.toContain('loaves');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'wa1', 'draft')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
