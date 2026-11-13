/** @jest-environment jsdom */
import { render, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useAppKeyboard } from '../src/app/hooks/useAppKeyboard.js';
import { claimKeyboard } from '../src/lib/keyboardClaim.js';

function Harness({ undo, redo }) {
  useAppKeyboard({
    onNewAgent: jest.fn(),
    onNewWindow: jest.fn(),
    redo,
    undo,
    setFocusMode: jest.fn(),
    spawnAt: jest.fn(),
  });
  return null;
}

test('the dock undo and redo buttons step the board back and forward', () => {
  const undo = jest.fn();
  const redo = jest.fn();
  render(<Harness undo={undo} redo={redo} />);
  act(() => {
    window.dispatchEvent(new CustomEvent('canvas:history', { detail: { action: 'undo' } }));
    window.dispatchEvent(new CustomEvent('canvas:history', { detail: { action: 'redo' } }));
  });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(1);
});

test('a click on undo still steps back while a window has the keyboard', () => {
  const undo = jest.fn();
  render(<Harness undo={undo} redo={jest.fn()} />);
  const release = claimKeyboard('game');
  try {
    act(() => {
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { action: 'undo' } }));
    });
    expect(undo).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
});

test('Ctrl+Z still steps the board back', () => {
  const undo = jest.fn();
  const redo = jest.fn();
  render(<Harness undo={undo} redo={redo} />);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
  });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(1);
});
