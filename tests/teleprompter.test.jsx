/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeleprompterWindow } from '../src/components/windows/teleprompter/index.jsx';
import { prompterKeyAction } from '../src/components/teleprompter/Prompter.jsx';
import { TeleprompterPage, isTeleprompterPage } from '../src/components/teleprompter/TeleprompterPage.jsx';
import { DEFAULT_SCRIPT } from '../src/lib/teleprompter/defaultScript.js';
import { normalizePrompter, PROMPTER_KEY, pixelsPerSecond, readingTime, readShared, writeShared } from '../src/lib/teleprompter/prompterState.js';
import { openPrompterPopOut, prompterUrl } from '../src/lib/teleprompter/popOut.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.__TAURI_INTERNALS__;
});

test('a new teleprompter starts with the Tavily how-to lines and safe settings', () => {
  const state = normalizePrompter({ speed: 99, size: 2, mirror: 'yes' });
  expect(state.text).toBe(DEFAULT_SCRIPT);
  expect(DEFAULT_SCRIPT).toMatch(/^This is LeadHound/);
  expect(DEFAULT_SCRIPT).not.toMatch(/Ctrl\+K|Click/);
  expect(state).toMatchObject({ speed: 10, size: 20, mirror: true });
  expect(normalizePrompter({ text: '' }).text).toBe('');
});

test('reading time and speed', () => {
  expect(readingTime('one two three').words).toBe(3);
  expect(readingTime(DEFAULT_SCRIPT).seconds).toBeGreaterThan(20);
  expect(readingTime('').label).toBe('0 sec');
  expect(pixelsPerSecond(4, 40)).toBeGreaterThan(pixelsPerSecond(2, 40));
});

test('keys map to reader actions', () => {
  expect(prompterKeyAction(' ')).toBe('toggle');
  expect(prompterKeyAction('ArrowUp')).toBe('faster');
  expect(prompterKeyAction('ArrowDown')).toBe('slower');
  expect(prompterKeyAction('r')).toBe('restart');
  expect(prompterKeyAction('x')).toBeNull();
});

test('the pop-out page is picked by ?teleprompter', () => {
  expect(isTeleprompterPage('?teleprompter=1')).toBe(true);
  expect(isTeleprompterPage('?board=1')).toBe(false);
  expect(prompterUrl('http://localhost:3002')).toBe('http://localhost:3002/?teleprompter=1');
});

test('the window saves speed changes and shares them with the pop-out', () => {
  const onUpdate = jest.fn();
  render(<TeleprompterWindow win={{ id: 'w1', kind: 'teleprompter' }} onUpdate={onUpdate} />);
  expect(screen.getByText(/This is LeadHound/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Faster'));
  expect(onUpdate).toHaveBeenCalledWith({ speed: 5 });
  expect(readShared().speed).toBe(5);
});

test('editing the script in the window', () => {
  const onUpdate = jest.fn();
  render(<TeleprompterWindow win={{ id: 'w1', kind: 'teleprompter', text: 'Hi' }} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByText('Edit script'));
  fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'Hello there' } });
  expect(onUpdate).toHaveBeenCalledWith({ text: 'Hello there' });
  expect(readShared().text).toBe('Hello there');
});

test('the pop-out page follows edits made in the window', () => {
  writeShared({ text: 'First words' });
  render(<TeleprompterPage />);
  expect(screen.getByText('First words')).toBeTruthy();
  act(() => {
    writeShared({ text: 'Second words' });
    window.dispatchEvent(new StorageEvent('storage', { key: PROMPTER_KEY }));
  });
  expect(screen.getByText('Second words')).toBeTruthy();
});

test('pop out uses the desktop app on-top window first', async () => {
  const invoke = jest.fn(() => Promise.resolve());
  window.__TAURI_INTERNALS__ = { invoke };
  await expect(openPrompterPopOut({ url: 'http://localhost:3002/?teleprompter=1' })).resolves.toBe('desktop-on-top');
  expect(invoke).toHaveBeenCalledWith('teleprompter_open', expect.objectContaining({ url: 'http://localhost:3002/?teleprompter=1' }));
});

test('an older desktop app falls back to a plain separate window', async () => {
  const invoke = jest.fn((cmd) => (cmd === 'teleprompter_open' ? Promise.reject(new Error('unknown command')) : Promise.resolve()));
  window.__TAURI_INTERNALS__ = { invoke };
  await expect(openPrompterPopOut({ win: {}, url: 'x' })).resolves.toBe('desktop-window');
  expect(invoke).toHaveBeenLastCalledWith('open_external_window', { url: 'x', title: 'Teleprompter' });
});

test('Chrome and Edge get an always-on-top picture-in-picture window', async () => {
  const doc = document.implementation.createHTMLDocument('pip');
  const requestWindow = jest.fn(() => Promise.resolve({ document: doc }));
  await expect(openPrompterPopOut({ win: { documentPictureInPicture: { requestWindow } }, url: 'http://x/?teleprompter=1' })).resolves.toBe('picture-in-picture');
  expect(doc.querySelector('iframe').getAttribute('src')).toBe('http://x/?teleprompter=1');
});
