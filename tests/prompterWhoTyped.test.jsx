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
import { setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { noteSignedInName } from '../src/lib/collaboration/signedInName.js';
import { TeleprompterWindow } from '../src/components/windows/teleprompter/index.jsx';

// Who typed what in a Teleprompter script: Pat Example and Sam Example write
// the same script on two screens, and "Who typed what" tints each person's
// part with a row of names and letter counts. All people and words are made up.
const win = (text) => ({ id: 'tp1', kind: 'teleprompter', x: 0, y: 0, w: 400, h: 300, title: 'Bakery tour', text });
const board = (text) => ({ wins: [win(text)] });
const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };

function twoScreens() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, board(''), 'local');
  sync();
  return { a, b, sync };
}

function type(doc, who, from, to) {
  noteSignedInName(who?.name ?? null, who?.id ?? null);
  writeStateToDoc(doc, board(from), board(to), 'local');
}

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("the Teleprompter shows each person's part of the script with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', 'Welcome to the bakery');
  sync();
  type(b, SAM, 'Welcome to the bakery', 'Welcome to the bakery tour');
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  const { container } = render(<TeleprompterWindow win={win('Welcome to the bakery tour')} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Who typed what/ }));
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent('Pat Example · 21 letters');
  expect(names).toHaveTextContent('Sam Example · 5 letters');
  expect(container.querySelector('[data-typed-by="Sam Example"]')).toHaveTextContent('tour');
  expect(container.querySelector('[data-typed-by="Pat Example"]')).toHaveAttribute('title', 'Typed by Pat Example');
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, 'Welcome to the bakery tour', 'Welcome to the bakery tour!');
  act(() => sync());
  expect(names).toHaveTextContent('Sam Example · 6 letters');
  // The same button goes back to the reader.
  fireEvent.click(screen.getByRole('button', { name: /Hide who typed what/ }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
});

test('with the board not shared live, the view says so', () => {
  render(<TeleprompterWindow win={win('Welcome to the bakery')} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Who typed what/ }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
