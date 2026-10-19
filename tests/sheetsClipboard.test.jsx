/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { OfficeSheetsWindow } from '../src/components/windows/officeSheets/index.jsx';
import { OFFICE_STARTERS } from '../src/lib/office/officeStarters.js';

// The browser aims Ctrl+C and Ctrl+V at the page's text selection when there
// is one, and that can sit outside the sheet (a word double-clicked earlier)
// while the cells have the focus. Focused cells must still get both.

let latest;
function Harness() {
  const [win, setWin] = React.useState({ id: 'w1', ...OFFICE_STARTERS.officeSheets });
  latest = win;
  return <OfficeSheetsWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

function clipboardEvent(type, data) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  return event;
}

let elsewhere;
beforeEach(() => {
  elsewhere = document.createElement('p');
  elsewhere.textContent = 'a word selected earlier';
  document.body.appendChild(elsewhere);
});
afterEach(() => { cleanup(); elsewhere.remove(); });

test('focused cells take a paste aimed at a selection elsewhere on the page', () => {
  render(<Harness />);
  screen.getByLabelText('Sheet1 cells').focus();
  const paste = clipboardEvent('paste', { getData: () => 'Apples\t12\nPears\t4' });
  act(() => { elsewhere.dispatchEvent(paste); });
  expect(paste.defaultPrevented).toBe(true);
  expect(latest['oc.s1.A1']).toEqual({ v: 'Apples' });
  expect(latest['oc.s1.B2']).toEqual({ v: '4' });
});

test('focused cells answer Ctrl+C with their own text', () => {
  render(<Harness />);
  screen.getByLabelText('Sheet1 cells').focus();
  act(() => { elsewhere.dispatchEvent(clipboardEvent('paste', { getData: () => 'Apples' })); });
  const setData = jest.fn();
  const copy = clipboardEvent('copy', { setData });
  act(() => { elsewhere.dispatchEvent(copy); });
  expect(copy.defaultPrevented).toBe(true);
  expect(setData).toHaveBeenCalledWith('text/plain', 'Apples');
});

test('cells without the focus leave copy and paste alone, and an empty paste changes nothing', () => {
  render(<Harness />);
  const before = { ...latest };
  const paste = clipboardEvent('paste', { getData: () => 'Apples' });
  act(() => { elsewhere.dispatchEvent(paste); });
  expect(paste.defaultPrevented).toBe(false);
  screen.getByLabelText('Sheet1 cells').focus();
  const empty = clipboardEvent('paste', { getData: () => '' });
  act(() => { elsewhere.dispatchEvent(empty); });
  expect(empty.defaultPrevented).toBe(false);
  expect(latest).toEqual(before);
});
