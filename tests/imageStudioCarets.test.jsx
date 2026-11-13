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
import { ImageStudioPrompt } from '../src/components/windows/imageStudio/ImageStudioPrompt.jsx';
import { useStudioWords } from '../src/components/windows/imageStudio/useStudioWords.js';

// Live cursors in Image Studio's prompt and additional instructions: Pat sees
// where Sam is typing in each box, as a line with Sam's name, and Pat's own
// cursor goes out to teammates. Only a spot in the shared words goes out,
// never the words. All people and words are made up.
const PROMPT = 'a poster for Sam Example Bakery';
const NOTES = 'warm colours, no text';
const WIN = { id: 's1', kind: 'imageStudio', x: 0, y: 0, w: 720, h: 520, prompt: PROMPT, imageNotes: NOTES };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const P = 'Image prompt';
const N = 'Additional instructions';

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

// The real prompt panel, wired to the window the way the studio wires it.
function Panel({ win }) {
  const words = useStudioWords(win, () => {});
  return <ImageStudioPrompt winId={win.id} state={{ model: 'imagen-4.0-generate-001' }} words={words} updateFields={() => {}} onGenerate={() => {}} />;
}

function openStudio(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<Panel win={WIN} />);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const markIn = (label) => screen.getByRole('textbox', { name: label }).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the prompt shows a teammate's cursor with their name", async () => {
  const { a, b } = twoDocs();
  const pat = openStudio(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 's1', 'prompt', 'a poster'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(P)).toHaveAttribute('data-at', '8');
  expect(markIn(N)).toBeNull();
});

test("the additional instructions show a teammate's cursor in that box only", async () => {
  const { a, b } = twoDocs();
  const pat = openStudio(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 's1', 'imageNotes', 4) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(markIn(N)).toHaveAttribute('data-at', '4');
  expect(markIn(P)).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = openStudio(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 's1', 'prompt', 8) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  const text = (doc) => doc.getMap('canvas').get('windows').get('s1').get('prompt');
  act(() => { text(b).insert(0, 'bold '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(P)).toHaveAttribute('data-at', '13');
});

test('typing in either box tells teammates where my cursor is, and leaving takes it away', async () => {
  const { a } = twoDocs();
  const awareness = openStudio(a);
  jest.useFakeTimers();
  try {
    for (const [label, field, at] of [[P, 'prompt', 3], [N, 'imageNotes', 6]]) {
      const box = screen.getByRole('textbox', { name: label });
      act(() => { box.focus(); box.setSelectionRange(at, at); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: 's1', field }));
      expect(JSON.stringify(sent)).not.toContain('colours');
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 's1', field)[0].index).toBe(at);
      act(() => { box.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    }
  } finally {
    jest.useRealTimers();
  }
});
