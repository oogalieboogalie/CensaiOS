/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { WhatsAppWindow } from '../src/components/WhatsAppWindow.jsx';

// A WhatsApp window's quick message merges letter by letter: Pat and Sam
// typing in it at the same moment both keep what they typed, and each sees
// the other's letters as they type (before, it was saved only when you
// clicked away, and the last one to click away won). All words are made up.
const LOCAL = 'local';
const MSG = 'Hi Sam Example, the rye loaves are ready';
const board = (fields = {}) => ({
  wins: [{ id: 'wa1', kind: 'whatsapp', x: 0, y: 0, w: 420, h: 560, contacts: [], draft: MSG, ...fields }],
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

const winOf = (doc, base) => readDocState(doc, base).wins[0];

afterEach(cleanup);

test('Pat and Sam typing in the message at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ draft: `Morning! ${MSG}` }), LOCAL);
  writeStateToDoc(b, base, board({ draft: `${MSG} at noon` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).draft).toBe(`Morning! ${MSG} at noon`);
});

test('one person typing the message and the other saving a contact both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  const contacts = [{ name: 'Pat Example', phone: '15550100' }];
  writeStateToDoc(a, base, board({ draft: `${MSG}!` }), LOCAL);
  writeStateToDoc(b, base, board({ contacts }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = winOf(doc, base);
    expect([win.draft, win.contacts]).toEqual([`${MSG}!`, contacts]);
  }
});

test('typing in the message hands each letter to the board at once', () => {
  const changes = [];
  render(<WhatsAppWindow win={board().wins[0]} onUpdate={(p) => changes.push(p)} />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: `${MSG}.` } });
  expect(changes).toContainEqual({ draft: `${MSG}.` });
});

test("a teammate's letters show in the box and keep your cursor in place", () => {
  const win = board().wins[0];
  const { rerender } = render(<WhatsAppWindow win={win} onUpdate={() => {}} />);
  const box = screen.getByLabelText('Message');
  act(() => { box.focus(); box.setSelectionRange(3, 3); });
  rerender(<WhatsAppWindow win={{ ...win, draft: `Pat: ${MSG}` }} onUpdate={() => {}} />);
  expect(box.value).toBe(`Pat: ${MSG}`);
  expect(box.selectionStart).toBe(8);
});

test('clicking away no longer sends an old copy of the message back', () => {
  const changes = [];
  const win = board().wins[0];
  const { rerender } = render(<WhatsAppWindow win={win} onUpdate={(p) => changes.push(p)} />);
  const box = screen.getByLabelText('Message');
  act(() => { box.focus(); });
  rerender(<WhatsAppWindow win={{ ...win, draft: `${MSG} (Sam)` }} onUpdate={(p) => changes.push(p)} />);
  act(() => { box.blur(); });
  expect(changes.some((p) => 'draft' in p)).toBe(false);
});
