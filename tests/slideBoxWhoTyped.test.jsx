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
import { OfficeSlidesWindow } from '../src/components/windows/officeSlides/index.jsx';

// Who typed what in a slide's text box: Pat Example and Sam Example write
// the same box on two screens, and with the box selected "Who typed what"
// tints each person's part with a row of names and letter counts, the same
// as the speaker notes. Pressing it again, picking another box or another
// slide goes back to the words. All people and words are made up.
const TITLE = 'Made-up cover';
const PAT_WORDS = 'Fresh bread every morning.';
const SAM_WORDS = ' Made-up rolls on Sunday.';
const block = (id, text, y) => ({ id, type: 'text', x: 6, y, w: 88, h: 30, text });
const slide = (blocks, at) => ({ layout: 'titleBody', blocks, notes: '', at });
const win = (body) => ({
  id: 'sl1', kind: 'officeSlides', x: 0, y: 0, w: 960, h: 600, title: 'Made-up pitch',
  officeDeck: { order: ['s1', 's2'], theme: 'censai' },
  'os.s1': slide([block('t1', TITLE, 7), block('b1', body, 45)], 1),
  'os.s2': slide([block('t2', 'Made-up plan', 7)], 2),
});
const board = (body) => ({ wins: [win(body)] });
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

const stage = () => screen.getByRole('group', { name: 'Slide editor' });
const boxOf = (words) => [...stage().querySelectorAll('.hb-of-sblock')].find((el) => el.textContent.includes(words));
const pick = (words) => { fireEvent.pointerDown(boxOf(words)); fireEvent.pointerUp(window); };
const whoButton = () => screen.getByRole('button', { name: 'Who typed this box' });

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
});

test("two people type in one slide box, and the button shows each one's part with their name", () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', PAT_WORDS);
  sync();
  type(b, SAM, PAT_WORDS, PAT_WORDS + SAM_WORDS);
  sync();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<OfficeSlidesWindow win={win(PAT_WORDS + SAM_WORDS)} onUpdate={jest.fn()} />);
  // No box picked: no button.
  expect(screen.queryByRole('button', { name: 'Who typed this box' })).toBeNull();
  pick(PAT_WORDS);
  fireEvent.click(whoButton());
  const pane = screen.getByTestId('slide-box-who-typed');
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent(`Pat Example · ${PAT_WORDS.length} letters`);
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length} letters`);
  expect(pane.querySelector('[data-typed-by="Pat Example"]').textContent).toBe(PAT_WORDS);
  expect(pane.querySelector('[data-typed-by="Sam Example"]').textContent).toBe(SAM_WORDS);
  // Sam keeps typing on the other screen: the view follows.
  type(b, SAM, PAT_WORDS + SAM_WORDS, PAT_WORDS + SAM_WORDS + ' Yes.');
  act(() => sync());
  expect(names).toHaveTextContent(`Sam Example · ${SAM_WORDS.length + 5} letters`);
  // The same button goes back to the words, unchanged.
  fireEvent.click(screen.getByRole('button', { name: 'Hide who typed this box' }));
  expect(screen.queryByTestId('slide-box-who-typed')).toBeNull();
  expect(boxOf(PAT_WORDS)).toHaveTextContent(PAT_WORDS + SAM_WORDS);
});

test("each box is its own: the title shows only its writer, and the body's view goes away", () => {
  const { a } = twoScreens();
  type(a, PAT, '', PAT_WORDS);
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  pick(PAT_WORDS);
  fireEvent.click(whoButton());
  expect(screen.getByRole('list', { name: 'Who typed what' })).toHaveTextContent('Pat Example');
  pick(TITLE);
  expect(screen.queryByTestId('slide-box-who-typed')).toBeNull();
  fireEvent.click(whoButton());
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).not.toHaveTextContent('Pat Example');
  expect(names).toHaveTextContent('Not recorded');
});

test('moving to another slide or double-clicking to type goes back to the words', () => {
  const { a } = twoScreens();
  act(() => setCaretChannel(a, new Awareness(a)));
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  pick(PAT_WORDS);
  fireEvent.click(whoButton());
  fireEvent.doubleClick(screen.getByTestId('slide-box-who-typed').closest('.hb-of-sblock'));
  expect(screen.queryByTestId('slide-box-who-typed')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Slide text' })).toHaveValue(PAT_WORDS);
  fireEvent.blur(screen.getByRole('textbox', { name: 'Slide text' }));
  fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Slide 1' }));
  expect(screen.queryByTestId('slide-box-who-typed')).toBeNull();
});

test('with the board not shared live, the view says so', () => {
  render(<OfficeSlidesWindow win={win(PAT_WORDS)} onUpdate={jest.fn()} />);
  pick(PAT_WORDS);
  fireEvent.click(whoButton());
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});
