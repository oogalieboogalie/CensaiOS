/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { BrowserWindow } from '../src/components/BrowserWindow.jsx';

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
});

test('a page in the Browser window may ask for the mic and a game controller', () => {
  const win = { id: 'b1', kind: 'browser', url: 'https://deck.example.com/' };
  const { container } = render(<BrowserWindow win={win} onUpdate={() => {}} />);
  const frame = container.querySelector('iframe');
  expect(frame).not.toBeNull();
  const allow = frame.getAttribute('allow');
  expect(allow).toContain('microphone');
  expect(allow).toContain('gamepad');
  // Still sandboxed: no top-level navigation away from the board.
  expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
});
