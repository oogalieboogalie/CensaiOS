/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The To-do Assign menu offers "Me" and the coding agents next to the board's agents.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TodoRow } from '../src/components/todos/TodoRow.jsx';
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { resetMe } from '../src/components/todos/useMe.js';

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });

beforeEach(() => {
  resetMe();
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/auth/session')) return json({ authenticated: true, user: { id: 7, name: 'Sam Rivera' } });
    if (String(url).includes('/api/cli-agents/roster')) return json({ clis: [{ id: 'claudecode', installed: true, state: 'idle', running: 0 }] });
    return json({}, false);
  });
});

function row(item, onAssign = jest.fn()) {
  render(<TodoRow item={item} canHandoff editingId={null} editText="" onToggle={() => {}} onAssign={onAssign}
    onHandoff={() => {}} onStartEdit={() => {}} onSaveEdit={() => {}} onCancelEdit={() => {}} onEditChange={() => {}} />);
  return onAssign;
}

test('Me and the coding agents are in Assign, and pick the right assignee', async () => {
  const onAssign = row({ id: 1, text: 'Call the print shop', done: false, assignee: null });
  fireEvent.click(screen.getByTestId('todo-assign'));
  await waitFor(() => expect(screen.getByText('Me')).toBeTruthy());
  expect(screen.getByText('Coding agents')).toBeTruthy();
  for (const name of ['Claude Code', 'Codex', 'Gemini CLI', 'OpenCode', 'Copilot CLI', 'Grok']) expect(screen.getByText(name)).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
  fireEvent.click(screen.getByText('Me'));
  expect(onAssign).toHaveBeenCalledWith('user:7', 'Sam Rivera');
});

test('a to-do for a person can not be sent to an agent; one for Claude Code can', () => {
  row({ id: 1, text: 'Call the print shop', done: false, assignee: 'user:7', assigneeName: 'Sam Rivera' });
  expect(screen.getByTestId('todo-assign').title).toBe('Assigned to Sam Rivera');
  expect(screen.getByTestId('todo-send').disabled).toBe(true);
  expect(screen.getByTestId('todo-send').title).toBe('This one is for Sam Rivera, not an agent');
});

test('a to-do assigned to Claude Code offers to start it', () => {
  row({ id: 2, text: 'Fix the link', done: false, assignee: 'cli:claudecode', assigneeName: 'Claude Code' });
  expect(screen.getByTestId('todo-send').disabled).toBe(false);
  expect(screen.getByTestId('todo-send').title).toBe('Start Claude Code on this to-do');
});

test('picking Me in a To-do window saves who it is for, with their name', async () => {
  const onUpdate = jest.fn();
  render(<TodosWindow win={{ id: 'todos-1', kind: 'todos', items: [{ id: 1, text: 'Call the print shop', done: false, assignee: null }] }} onUpdate={onUpdate} currentProject={null} />);
  fireEvent.click(screen.getByTestId('todo-assign'));
  await waitFor(() => expect(screen.getByText('Me')).toBeTruthy());
  fireEvent.click(screen.getByText('Me'));
  expect(onUpdate).toHaveBeenCalledWith({ items: [expect.objectContaining({ id: 1, assignee: 'user:7', assigneeName: 'Sam Rivera' })] });
});
