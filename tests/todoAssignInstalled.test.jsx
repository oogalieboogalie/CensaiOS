/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// To-do Assign offers only the coding agents this computer really has (the
// Agent Console's roster); the rest show greyed with why. Fake people only.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const logLines = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logFailure: () => {},
  logToApp: (level, message, options) => logLines.push({ level, message, options }),
}));

const { TodoRow } = await import('../src/components/todos/TodoRow.jsx');
const { resetMe } = await import('../src/components/todos/useMe.js');
const { codingAgentChoice } = await import('../src/components/todos/codingAgentChoice.js');

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });
// A stand-in roster: only Claude Code (signed in) and Grok (not signed in yet) are installed.
const ROSTER = [
  { id: 'claudecode', installed: true, signedIn: true, state: 'idle', running: 0 },
  { id: 'codex', installed: false, signedIn: false, state: 'idle', running: 0 },
  { id: 'gemini', installed: false, signedIn: false, state: 'idle', running: 0 },
  { id: 'opencode', installed: false, signedIn: false, state: 'idle', running: 0 },
  { id: 'copilot', installed: false, signedIn: false, state: 'idle', running: 0 },
  { id: 'grok', installed: true, signedIn: false, state: 'idle', running: 0 },
];

beforeEach(() => {
  resetMe();
  logLines.length = 0;
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/auth/session')) return json({ authenticated: true, user: { id: 7, name: 'Pat Example' } });
    if (String(url).includes('/api/cli-agents/roster')) return json({ clis: ROSTER });
    return json({}, false);
  });
});

function row(item, onAssign = jest.fn()) {
  render(<TodoRow item={item} canHandoff editingId={null} editText="" onToggle={() => {}} onAssign={onAssign}
    onHandoff={() => {}} onStartEdit={() => {}} onSaveEdit={() => {}} onCancelEdit={() => {}} onEditChange={() => {}} />);
  return onAssign;
}

const option = (id) => document.querySelector(`[data-assign="cli-${id}"]`);

test('installed agents are offered, the other four are greyed and say why', async () => {
  const onAssign = row({ id: 1, text: 'Fix the link', done: false, assignee: null });
  fireEvent.click(screen.getByTestId('todo-assign'));
  await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
  expect(option('claudecode').disabled).toBe(false);
  expect(option('grok').disabled).toBe(false);
  expect(screen.getByText('Installed, not signed in yet')).toBeTruthy();
  for (const id of ['codex', 'gemini', 'opencode', 'copilot']) expect(option(id).disabled).toBe(true);
  expect(screen.getAllByText('Not installed on this computer')).toHaveLength(4);
  fireEvent.click(option('codex'));
  expect(onAssign).not.toHaveBeenCalled();
  fireEvent.click(option('claudecode'));
  expect(onAssign).toHaveBeenCalledWith('cli:claudecode', 'Claude Code');
  expect(logLines).toEqual([]);
});

test('assigning an agent that is not signed in yet leaves one log line naming the agent only', async () => {
  const onAssign = row({ id: 1, text: 'Fix the link', done: false, assignee: null });
  fireEvent.click(screen.getByTestId('todo-assign'));
  await waitFor(() => expect(option('grok').disabled).toBe(false));
  fireEvent.click(option('grok'));
  expect(onAssign).toHaveBeenCalledWith('cli:grok', 'Grok');
  expect(logLines).toEqual([{ level: 'warn', message: 'todos: a to-do was assigned to Grok, which is not signed in on this computer', options: { where: 'todos' } }]);
  expect(JSON.stringify(logLines)).not.toMatch(/Fix the link|Pat/);
});

test('a to-do already assigned to an agent that is not installed still shows its name', () => {
  row({ id: 2, text: 'Fix the link', done: false, assignee: 'cli:codex', assigneeName: 'Codex' });
  expect(screen.getByTestId('todo-assign').title).toBe('Assigned to Codex');
});

test('the rules behind each line', () => {
  const at = { loaded: true };
  expect(codingAgentChoice(undefined, at)).toMatchObject({ offered: false, note: 'Not installed on this computer' });
  expect(codingAgentChoice({ installed: false, state: 'installing' }, at)).toMatchObject({ offered: true, ready: false, note: 'Installing' });
  expect(codingAgentChoice({ installed: true, signedIn: true, running: 1 }, at)).toMatchObject({ offered: true, ready: true, note: 'Working on something' });
  expect(codingAgentChoice(ROSTER[0], { loaded: false })).toMatchObject({ offered: false, note: 'Checking this computer' });
  expect(codingAgentChoice(ROSTER[0], { loaded: true, unavailable: true })).toMatchObject({ offered: false, note: 'Can\'t run on this server' });
});
