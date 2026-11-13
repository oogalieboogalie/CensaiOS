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
import { CodeEditorWindow } from '../src/components/CodeEditorWindow.jsx';

// Who typed what in the Code Editor: Pat Example and Sam Example write the
// same code on two screens, and "Who typed what" tints each person's part
// with a row of names and letter counts. All people and code are made up.
const PAT_CODE = "const shop = 'Made-up Bakery';";
const SAM_CODE = '\nconsole.log(shop);';
const win = (code) => ({ id: 'ce1', kind: 'code_editor', x: 0, y: 0, w: 600, h: 400, title: 'shop.js', code });
const board = (code) => ({ wins: [win(code)] });
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

test("the Code Editor shows each person's part of the code with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', PAT_CODE);
  sync();
  type(b, SAM, PAT_CODE, PAT_CODE + SAM_CODE);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  const { container } = render(<CodeEditorWindow win={win(PAT_CODE + SAM_CODE)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent(`Pat Example · ${PAT_CODE.length} letters`);
  expect(names).toHaveTextContent(`Sam Example · ${SAM_CODE.length} letters`);
  expect(container.querySelector('[data-typed-by="Sam Example"]')).toHaveTextContent('console.log(shop);');
  expect(container.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_CODE);
  // The code box is put away while the view is open.
  expect(container.querySelector('textarea')).toBeNull();
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, PAT_CODE + SAM_CODE, PAT_CODE + SAM_CODE + ' // ok');
  act(() => sync());
  expect(names).toHaveTextContent(`Sam Example · ${SAM_CODE.length + 6} letters`);
  // The same button goes back to the code.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed what' }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
  expect(container.querySelector('textarea')).not.toBeNull();
});

test('with the board not shared live, the view says so', () => {
  render(<CodeEditorWindow win={win(PAT_CODE)} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Who typed what' }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
