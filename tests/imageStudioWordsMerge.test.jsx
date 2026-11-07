/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { ImageStudioPrompt } from '../src/components/windows/imageStudio/ImageStudioPrompt.jsx';
import { useImageStudio } from '../src/components/windows/imageStudio/useImageStudio.js';
import { useStudioWords } from '../src/components/windows/imageStudio/useStudioWords.js';
import { useWorkspaceStore } from '../src/lib/store.js';

// Image Studio's prompt and additional instructions merge letter by letter:
// Pat and Sam typing in the same box at the same moment both keep what they
// typed, and each sees the other's words as they type (before, both boxes
// stayed on one screen, and the last to type replaced the other). All words
// are made up.
const LOCAL = 'local';
const PROMPT = 'a poster for Sam Example Bakery';
const NOTES = 'warm colours';
const board = (fields = {}) => ({
  wins: [{ id: 's1', kind: 'imageStudio', x: 0, y: 0, w: 720, h: 520, prompt: PROMPT, imageNotes: NOTES, ...fields }],
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

// The real prompt panel, wired to the window the way the studio wires it.
function Panel({ win, onUpdate }) {
  const words = useStudioWords(win, onUpdate);
  return <ImageStudioPrompt winId={win.id} state={{ model: 'imagen-4.0-generate-001' }} words={words} updateFields={() => {}} onGenerate={() => {}} />;
}

afterEach(cleanup);

test('Pat and Sam typing in the prompt at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ prompt: `bold ${PROMPT}` }), LOCAL);
  writeStateToDoc(b, base, board({ prompt: `${PROMPT}, in spring` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(readDocState(doc, base).wins[0].prompt).toBe(`bold ${PROMPT}, in spring`);
});

test('Pat and Sam typing in the additional instructions at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ imageNotes: `soft, ${NOTES}` }), LOCAL);
  writeStateToDoc(b, base, board({ imageNotes: `${NOTES}, no text` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(readDocState(doc, base).wins[0].imageNotes).toBe(`soft, ${NOTES}, no text`);
});

test('typing in either box saves to the board right away', () => {
  const updates = [];
  render(<Panel win={{ id: 's1' }} onUpdate={(p) => updates.push(p)} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Image prompt' }), { target: { value: 'a red kite' } });
  fireEvent.click(screen.getByRole('button', { name: 'Additional Instructions' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Additional instructions' }), { target: { value: 'no people' } });
  expect(updates).toEqual([{ prompt: 'a red kite' }, { imageNotes: 'no people' }]);
});

test("a teammate's words show in your boxes as they type", () => {
  const noop = () => {};
  const view = render(<Panel win={{ id: 's1' }} onUpdate={noop} />);
  fireEvent.click(screen.getByRole('button', { name: 'Additional Instructions' }));
  view.rerender(<Panel win={{ id: 's1', prompt: 'a red kite', imageNotes: 'no people' }} onUpdate={noop} />);
  expect(screen.getByRole('textbox', { name: 'Image prompt' }).value).toBe('a red kite');
  expect(screen.getByRole('textbox', { name: 'Additional instructions' }).value).toBe('no people');
});

test('a teammate typing before your cursor keeps your cursor in place', () => {
  const noop = () => {};
  const view = render(<Panel win={{ id: 's1' }} onUpdate={noop} />);
  view.rerender(<Panel win={{ id: 's1', prompt: PROMPT }} onUpdate={noop} />);
  const box = screen.getByRole('textbox', { name: 'Image prompt' });
  box.focus();
  const at = 'a poster'.length;
  box.setSelectionRange(at, at);
  view.rerender(<Panel win={{ id: 's1', prompt: `Sam: ${PROMPT}` }} onUpdate={noop} />);
  expect(box.value).toBe(`Sam: ${PROMPT}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Sam: a poster');
});

test('a studio saved before this still shows its old words', () => {
  const old = { id: 's1', state: { imageStudio: { prompt: 'an old prompt', additionalInstructions: 'old notes' } } };
  const { result } = renderHook(() => useStudioWords(old, () => {}));
  expect(result.current.prompt).toBe('an old prompt');
  expect(result.current.notes).toBe('old notes');
});

test('Generate sends the shared words, not a stale copy', async () => {
  const before = useWorkspaceStore.getState().workspaceId;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ images: [], image: { id: 'i1' } }) });
  act(() => useWorkspaceStore.setState({ workspaceId: 'w1' }));
  const win = { id: 's1', prompt: 'a red kite', imageNotes: 'no people', state: { imageStudio: { prompt: 'stale' } } };
  const { result } = renderHook(() => useImageStudio(win, () => {}));
  await act(async () => result.current.generate());
  const call = global.fetch.mock.calls.find(([url]) => url === '/api/images/generate');
  const sent = JSON.parse(call[1].body);
  expect(sent.prompt).toBe('a red kite');
  expect(sent.additionalInstructions).toBe('no people');
  act(() => useWorkspaceStore.setState({ workspaceId: before }));
  delete global.fetch;
});
