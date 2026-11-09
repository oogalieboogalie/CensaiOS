/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { cellSpotState, readCellSpots } from '../src/lib/collaboration/cellSpots.js';
import { setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { SheetsWindow } from '../src/components/SheetsWindow.jsx';
import { makeSheet, pasteGrid } from '../src/components/sheets/sheetModel.js';

// Live cursors in the board Spreadsheet: Pat sees which cell Sam is typing
// in, outlined in Sam's colour with Sam's name, and Pat's own cell goes out
// to teammates while Pat types. Only the cell's spot goes out, never the
// words. A spot in another sheet never shows here. All made up.
const SHEET = pasteGrid(makeSheet({ rows: 3 }), 'r0', 'c0', 'Rye flour\nOven repair');
const WIN = { id: 'w1', kind: 'sheets', x: 0, y: 0, w: 480, h: 320, sheet: SHEET };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function openSheet(win = WIN) {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<SheetsWindow win={win} onUpdate={() => {}} />);
  return awareness;
}

function teammate(pat, user, cell) {
  const other = new Awareness(new Y.Doc());
  other.setLocalState({ user, cell });
  act(() => {
    pat.states.set(other.clientID, other.getLocalState());
    pat.meta.set(other.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [other.clientID], updated: [], removed: [] }, 'remote']);
  });
  return other;
}

function leave(pat, other) {
  act(() => {
    pat.states.delete(other.clientID);
    pat.emit('change', [{ added: [], updated: [], removed: [other.clientID] }, 'remote']);
  });
}

const cellOf = (words) => screen.getByText(words).closest('td');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test('a cell spot names only the window, row and column, and odd ids are refused', () => {
  expect(cellSpotState('w1', 'r0', 'c1')).toEqual({ windowId: 'w1', rowId: 'r0', colId: 'c1' });
  expect(cellSpotState('w1', 'r0', '<script>')).toBeNull();
  expect(cellSpotState('', 'r0', 'c0')).toBeNull();
  const states = new Map([
    [1, { user: PAT, cell: { windowId: 'w1', rowId: 'r0', colId: 'c0' } }],
    [2, { user: SAM, cell: { windowId: 'w1', rowId: 'r1', colId: 'c0' } }],
    [3, { cell: { windowId: 'w1', rowId: 'r1', colId: 'c0' } }],
    [4, { user: { id: 'x', name: '  ' }, cell: { windowId: 'w2', rowId: 'r0', colId: 'c0' } }],
    [5, { user: { id: 'y', name: '' }, cell: { windowId: 'w1', rowId: 'r0', colId: 'c1' } }],
  ]);
  const spots = readCellSpots(states, 1, 'w1');
  expect([...spots.keys()].sort()).toEqual(['r0:c1', 'r1:c0']);
  expect(spots.get('r1:c0')).toEqual([expect.objectContaining({ name: 'Sam Example', clientId: '2' })]);
  expect(spots.get('r0:c1')[0].name).toBe('Someone');
});

test("Pat sees Sam's name on the cell Sam is typing in, and it goes when Sam stops", () => {
  const pat = openSheet();
  const sam = teammate(pat, SAM, cellSpotState('w1', 'r1', 'c0'));
  const cell = cellOf('Oven repair');
  expect(cell).toHaveAttribute('data-teammate', 'true');
  expect(cell.querySelector('[data-teammate-cell="Sam Example"]')).toHaveTextContent('Sam Example');
  expect(cellOf('Rye flour')).not.toHaveAttribute('data-teammate');

  // Sam moves to the cell above; the name follows.
  act(() => {
    pat.states.set(sam.clientID, { user: SAM, cell: cellSpotState('w1', 'r0', 'c0') });
    pat.emit('change', [{ added: [], updated: [sam.clientID], removed: [] }, 'remote']);
  });
  expect(cellOf('Rye flour').querySelector('[data-teammate-cell]')).toHaveTextContent('Sam Example');
  expect(cellOf('Oven repair')).not.toHaveAttribute('data-teammate');

  leave(pat, sam);
  expect(document.querySelector('[data-teammate-cell]')).toBeNull();
});

test('two teammates in one cell both show, and a spot in another sheet never does', () => {
  const pat = openSheet();
  teammate(pat, SAM, cellSpotState('w1', 'r0', 'c0'));
  teammate(pat, { id: 'lee-1', name: 'Lee Example' }, cellSpotState('w1', 'r0', 'c0'));
  teammate(pat, { id: 'kim-1', name: 'Kim Example' }, cellSpotState('w2', 'r1', 'c0'));
  const names = [...cellOf('Rye flour').querySelectorAll('[data-teammate-cell]')].map((el) => el.textContent);
  expect(names.sort()).toEqual(['Lee Example', 'Sam Example']);
  expect(screen.queryByText('Kim Example')).toBeNull();
});

test("Pat's own cell goes out while Pat types, without the words, and comes back off when Pat finishes", () => {
  const pat = openSheet();
  fireEvent.click(cellOf('Oven repair'));
  expect(pat.getLocalState().cell).toEqual({ windowId: 'w1', rowId: 'r1', colId: 'c0' });
  const input = screen.getByLabelText('Company cell');
  fireEvent.change(input, { target: { value: 'Oven repair Friday' } });
  expect(JSON.stringify(pat.getLocalState())).not.toContain('Oven');
  // Tab moves to the next cell; the spot moves with it.
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(pat.getLocalState().cell).toEqual({ windowId: 'w1', rowId: 'r1', colId: 'c1' });
  fireEvent.keyDown(screen.getByLabelText('Notes cell'), { key: 'Escape' });
  expect(pat.getLocalState().cell).toBeNull();
});

test('closing the sheet while typing takes Pat out of it', () => {
  const pat = openSheet();
  fireEvent.click(cellOf('Rye flour'));
  expect(pat.getLocalState().cell).not.toBeNull();
  cleanup();
  expect(pat.getLocalState().cell).toBeNull();
});
