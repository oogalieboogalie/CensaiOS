/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { GenImageWindow } from '../src/components/GenImage.jsx';

// The Image Generator's prompt merges letter by letter: Pat and Sam typing in
// the same prompt at the same moment both keep what they typed, and each sees
// the other's words as they type (before, the prompt stayed on one screen
// until someone pressed Cook). All words are made up.
const LOCAL = 'local';
const PROMPT = 'a watercolor of Sam Example Bakery at dawn';
const board = (fields = {}) => ({
  wins: [{ id: 'g1', kind: 'genImage', x: 0, y: 0, w: 460, h: 380, prompt: PROMPT, ...fields }],
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

afterEach(cleanup);

test('Pat and Sam typing in the prompt at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ prompt: `soft ${PROMPT}` }), LOCAL);
  writeStateToDoc(b, base, board({ prompt: `${PROMPT}, with snow` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(readDocState(doc, base).wins[0].prompt).toBe(`soft ${PROMPT}, with snow`);
});

test('typing in the prompt saves to the board right away', () => {
  const updates = [];
  render(<GenImageWindow win={{ id: 'g1' }} onUpdate={(p) => updates.push(p)} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Image prompt' }), { target: { value: 'a red kite' } });
  expect(updates).toEqual([{ prompt: 'a red kite' }]);
});

test("a teammate's words show in your prompt box as they type", () => {
  const noop = () => {};
  const view = render(<GenImageWindow win={{ id: 'g1' }} onUpdate={noop} />);
  view.rerender(<GenImageWindow win={{ id: 'g1', prompt: 'a red kite' }} onUpdate={noop} />);
  expect(screen.getByRole('textbox', { name: 'Image prompt' }).value).toBe('a red kite');
});

test('a teammate typing before your cursor keeps your cursor in place', () => {
  const noop = () => {};
  const view = render(<GenImageWindow win={{ id: 'g1' }} onUpdate={noop} />);
  view.rerender(<GenImageWindow win={{ id: 'g1', prompt: PROMPT }} onUpdate={noop} />);
  const box = screen.getByRole('textbox', { name: 'Image prompt' });
  box.focus();
  const at = 'a watercolor'.length;
  box.setSelectionRange(at, at);
  view.rerender(<GenImageWindow win={{ id: 'g1', prompt: `Sam: ${PROMPT}` }} onUpdate={noop} />);
  expect(box.value).toBe(`Sam: ${PROMPT}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Sam: a watercolor');
});

test("a teammate's finished picture shows on your screen too", () => {
  const noop = () => {};
  const pic = 'data:image/png;base64,AAAA';
  const view = render(<GenImageWindow win={{ id: 'g1', prompt: PROMPT }} onUpdate={noop} />);
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<GenImageWindow win={{ id: 'g1', prompt: PROMPT, generatedImage: pic }} onUpdate={noop} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe(pic);
});
