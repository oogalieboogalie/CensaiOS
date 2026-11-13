/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// An Agent Console names, in its header, the project its task works in. One
// that Hand off opens names the same project as the console it came from;
// one opened with only its task (Recent tasks, the Inbox, a help card's Open
// task) takes that task's folder. All folders and names are made up.
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logFailure: () => {},
  logToApp: () => {},
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { TaskView } = await import('../src/components/agentConsole/TaskView.jsx');
const { AgentConsoleWindow } = await import('../src/components/AgentConsoleWindow.jsx');
const { WindowProjectChip } = await import('../src/components/windows/WindowProjectChip.jsx');

afterEach(() => { cleanup(); delete global.fetch; });
window.HTMLElement.prototype.scrollIntoView = () => {};

const SHOP = '/made-up/shop';
const PROJECT = { type: 'local', name: 'Made-up Shop', path: SHOP };
const TASK = { id: 'made-up-task', title: 'Made-up task', cli: 'claudecode', cliLabel: 'Claude Code', status: 'done', folder: SHOP, worktree: { branch: 'made-up-branch' } };
const REVIEW = { id: 'made-up-review', title: 'Made-up review', cli: 'codex', cliLabel: 'Codex', status: 'done', folder: SHOP, worktree: { branch: 'made-up-review-branch' } };
const live = { task: TASK, items: [], error: null, live: false, poll: async () => {}, loadChanges: () => {}, changes: { loaded: true, patch: '', files: [] } };

// The server's answers by address (any query left off); {} for the rest.
function server(routes) {
  global.fetch = jest.fn(async (url) => ({ ok: true, status: 200, json: async () => routes[String(url).split('?')[0]] ?? {} }));
}

/** The project a window's header names. */
function named(win) {
  const { container, unmount } = render(<WindowProjectChip win={win} onUpdate={jest.fn()} />);
  const name = container.querySelector('.hb-win-project-name')?.textContent;
  unmount();
  return name;
}

async function handOff(project) {
  server({ '/api/cli-agents/tasks/made-up-task/handoff': { task: REVIEW }, '/api/cli-agents/roster': { clis: [] } });
  const onSpawn = jest.fn();
  render(<TaskView taskId="made-up-task" live={live} onSpawn={onSpawn} onNewTask={jest.fn()} project={project} />);
  fireEvent.click(screen.getByTestId('agent-handoff-open'));
  await act(async () => { fireEvent.click(screen.getByTestId('agent-handoff-send')); });
  cleanup();
  return onSpawn.mock.calls.find(([kind]) => kind === 'agentConsole')?.[1];
}

describe('a console Hand off opens', () => {
  test("works in the first one's folder and names the same project in its header", async () => {
    const opened = await handOff(PROJECT);
    expect(opened).toEqual({ taskId: 'made-up-review', cli: 'codex', title: 'Codex', folder: SHOP, project: PROJECT });
    const first = { id: 'made-up-first', kind: 'agentConsole', folder: SHOP, project: PROJECT };
    expect(named(first)).toBe('Made-up Shop');
    expect(named({ id: 'made-up-second', kind: 'agentConsole', ...opened })).toBe('Made-up Shop');
  });

  test("names the folder it works in when that is outside the first one's project", async () => {
    const opened = await handOff({ type: 'local', name: 'Made-up Other', path: '/made-up/other' });
    expect(opened).toEqual({ taskId: 'made-up-review', cli: 'codex', title: 'Codex', folder: SHOP });
    expect(named({ id: 'made-up-second', kind: 'agentConsole', ...opened })).toBe('shop');
  });
});

describe('a console opened with only its task', () => {
  const routes = {
    '/api/cli-agents/roster': { clis: [] },
    '/api/cli-agents/tasks/made-up-review': { task: REVIEW, items: [], permissions: [], rev: 1 },
    '/api/cli-agents/tasks/made-up-review/changes': { files: [], patch: '' },
  };

  test("takes the task's folder, so its header names where the task works", async () => {
    server(routes);
    const onUpdate = jest.fn();
    render(<AgentConsoleWindow win={{ id: 'made-up-inbox', kind: 'agentConsole', taskId: 'made-up-review', title: 'Codex' }} onUpdate={onUpdate} onSpawn={jest.fn()} currentProject={null} />);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ folder: SHOP }));
  });

  test('keeps a folder it already has', async () => {
    server(routes);
    const onUpdate = jest.fn();
    render(<AgentConsoleWindow win={{ id: 'made-up-own', kind: 'agentConsole', taskId: 'made-up-review', title: 'Codex', folder: '/made-up/other' }} onUpdate={onUpdate} onSpawn={jest.fn()} currentProject={null} />);
    expect(await screen.findByText('Made-up review')).toBeInTheDocument();
    expect(onUpdate.mock.calls.some(([patch]) => 'folder' in patch)).toBe(false);
  });

  test('Recent tasks opens one with its folder', async () => {
    server({ '/api/cli-agents/roster': { clis: [] }, '/api/cli-agents/tasks': { tasks: [REVIEW] }, '/api/cli-agents/folders': { folders: [] } });
    const onUpdate = jest.fn();
    render(<AgentConsoleWindow win={{ id: 'made-up-new', kind: 'agentConsole' }} onUpdate={onUpdate} onSpawn={jest.fn()} currentProject={null} />);
    fireEvent.click(await screen.findByText('Made-up review'));
    expect(onUpdate).toHaveBeenCalledWith({ taskId: 'made-up-review', cli: 'codex', title: 'Codex', folder: SHOP });
  });
});
