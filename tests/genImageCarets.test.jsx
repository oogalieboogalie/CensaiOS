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
import { GenImageWindow } from '../src/components/GenImage.jsx';

// Live cursors in the Image Generator's prompt: Pat sees where Sam is typing,
// as a line with Sam's name, and Pat's own cursor goes out to teammates. Only
// a spot in the shared words goes out, never the words. All made up.
const PROMPT = 'a watercolor of Sam Example Bakery';
const WIN = { id: 'g1', kind: 'genImage', x: 0, y: 0, w: 460, h: 380, prompt: PROMPT };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const P = 'Image prompt';

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

// Opens the window and clicks "Edit prompt" so the prompt box is showing.
function openGenerator(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<GenImageWindow win={WIN} onUpdate={() => {}} />);
  fireEvent.click(screen.getByTitle('Edit prompt'));
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = () => screen.getByRole('textbox', { name: P }).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the prompt shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openGenerator(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'g1', 'prompt', 'a watercolor'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn()).toHaveAttribute('data-at', '12');
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = openGenerator(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'g1', 'prompt', 12) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  const text = (doc) => doc.getMap('canvas').get('windows').get('g1').get('prompt');
  act(() => { text(b).insert(0, 'soft '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn()).toHaveAttribute('data-at', '17');
});

test("a teammate's cursor in another field does not show in the prompt", async () => {
  const { a, b } = twoDocs();
  const pat = openGenerator(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'g1', 'title', 2) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn()).toBeNull();
});

test('typing in the prompt tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const awareness = openGenerator(a);
  jest.useFakeTimers();
  try {
    const box = screen.getByRole('textbox', { name: P });
    act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'g1', field: 'prompt' }));
    expect(JSON.stringify(sent)).not.toContain('Bakery');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'g1', 'prompt')[0].index).toBe(5);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
