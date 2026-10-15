/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { HotkeysSection } from '../src/components/theme/HotkeysSection.jsx';
import { useAgentHotkeys } from '../src/app/hooks/useAgentHotkeys.js';
import { loadAgentHotkeys } from '../src/lib/agentHotkeys.js';
import { copilot } from '../server/cli-agents/adapters/copilot.js';

beforeEach(() => localStorage.clear());

test('Alt+C opens a terminal running Claude Code, even from inside another terminal', () => {
  const spawnAt = jest.fn();
  renderHook(() => useAgentHotkeys(spawnAt));
  const inner = document.createElement('textarea');
  inner.className = 'xterm-helper-textarea';
  document.body.appendChild(inner);
  const stopped = jest.fn((e) => e.stopPropagation());
  inner.addEventListener('keydown', stopped);
  fireEvent.keyDown(inner, { key: 'ç', code: 'KeyC', altKey: true });
  expect(spawnAt).toHaveBeenCalledWith('terminal', expect.objectContaining({ title: 'Claude Code', launchCli: 'claudecode' }));
  fireEvent.keyDown(inner, { key: 'G', code: 'KeyG', altKey: true });
  expect(spawnAt).toHaveBeenLastCalledWith('terminal', expect.objectContaining({ launchCli: 'copilot' }));
  fireEvent.keyDown(inner, { key: 'q', code: 'KeyQ', altKey: true });
  expect(spawnAt).toHaveBeenCalledTimes(2);
});

test('Settings > Hotkeys records a new key and the hotkey follows it', () => {
  const spawnAt = jest.fn();
  renderHook(() => useAgentHotkeys(spawnAt));
  render(<HotkeysSection />);
  const button = screen.getByRole('button', { name: 'Key for Claude Code' });
  expect(button.textContent).toBe('Alt+C');
  fireEvent.click(button);
  expect(button.textContent).toMatch(/Press Alt/);
  fireEvent.keyDown(button, { key: 'k', code: 'KeyK', altKey: true });
  expect(button.textContent).toBe('Alt+K');
  expect(spawnAt).not.toHaveBeenCalled();
  expect(loadAgentHotkeys().claudecode).toBe('Alt+K');
  fireEvent.keyDown(document.body, { code: 'KeyK', altKey: true });
  expect(spawnAt).toHaveBeenCalledWith('terminal', expect.objectContaining({ launchCli: 'claudecode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Put the original keys back' }));
  expect(loadAgentHotkeys().claudecode).toBe('Alt+C');
});

test('Copilot CLI adapter: task is one argv element, plain text becomes one message', () => {
  const task = 'fix it; rm -rf ~';
  expect(copilot.buildRun({ task, model: '$(id)' }).args).toEqual(['-p', task, '--allow-tool', 'write']);
  const parse = copilot.createParser();
  const [first] = parse(null, 'Line one');
  const [second] = parse(null, 'Line two');
  expect(first.op).toBe('add');
  expect(second).toEqual({ op: 'append', id: first.item.id, text: '\nLine two' });
});
