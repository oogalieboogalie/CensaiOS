/**
 * @jest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logFailure: () => {},
  logToApp: () => {},
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { TaskView } = await import('../src/components/agentConsole/TaskView.jsx');

afterEach(() => { cleanup(); });
window.HTMLElement.prototype.scrollIntoView = () => {};

const task = {
  id: 'made-up-task', title: 'Made-up task', cli: 'grok', cliLabel: 'Grok', status: 'running',
  approvalGated: true, worktree: { branch: 'hb/agent-ask' }, createdBy: { name: 'Atlas' },
};
const live = {
  task, error: null, live: true, poll: async () => {}, loadChanges: () => {},
  changes: { loaded: true, patch: '', files: [] },
  items: [{ id: 'note-approvals', kind: 'note', text: 'Approvals stay on. An agent cannot turn approvals off.', at: 1 }],
};

test('an agent-started console says approvals stay on', () => {
  render(<TaskView taskId="made-up-task" live={live} onSpawn={jest.fn()} onNewTask={jest.fn()} />);
  expect(screen.getByTestId('task-approval-gate')).toHaveTextContent('Approvals stay on');
  expect(screen.getByText(/cannot turn approvals off/)).toBeTruthy();
});

test('a console someone started themselves does not show that line', () => {
  render(<TaskView taskId="made-up-task" live={{ ...live, task: { ...task, approvalGated: false }, items: [] }} onSpawn={jest.fn()} onNewTask={jest.fn()} />);
  expect(screen.queryByTestId('task-approval-gate')).toBeNull();
});
