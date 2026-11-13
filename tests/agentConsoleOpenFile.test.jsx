/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// The Agent Console's "Open in Code Editor" puts a file in a Code Editor
// window on the shared board, where everyone sees its words. So it asks for
// the words a teammate sees (`board=1`): a key the agent copied from .env into
// config.js comes as [hidden] even when Pat Example, this computer's owner,
// opens it, and the window says why. A file only the owner opens still stays
// on Pat's screen. All files, keys and words are made up.
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logFailure: () => {},
  logToApp: () => {},
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { TaskView } = await import('../src/components/agentConsole/TaskView.jsx');
const { CodeEditorWindow } = await import('../src/components/CodeEditorWindow.jsx');
const { HIDDEN_MARK, HIDDEN_WORDS } = await import('../shared/files/fileProblems.js');

afterEach(() => { cleanup(); delete global.fetch; });
window.HTMLElement.prototype.scrollIntoView = () => {};

const KEY = 'not-a-real-made-up-key';
const ON_BOARD = `export const madeUpKey = '${HIDDEN_MARK}';\n`;
const FILES = {
  'config.js': { path: 'config.js', content: ON_BOARD, hiddenWords: true },
  'README.md': { path: 'README.md', content: '# Made-up shop\n' },
  '.env': { path: '.env', content: `MADE_UP_KEY=${KEY}\n`, ownerOnly: true },
};
const changed = (...paths) => ({
  task: { id: 'made-up-task', title: 'Made-up task', cli: 'claudecode', cliLabel: 'Claude Code', status: 'done', worktree: { branch: 'made-up-branch' } },
  items: [], error: null, live: false, poll: async () => {}, loadChanges: () => {},
  changes: { loaded: true, patch: '', files: paths.map((path) => ({ path, change: 'modified', additions: 1, deletions: 1 })) },
});

// The server's answer for each file, as server/routes/cliAgents.js gives it on `board=1`.
function server() {
  global.fetch = jest.fn(async (url) => ({ ok: true, status: 200, json: async () => FILES[new URL(url, 'http://made-up.invalid').searchParams.get('path')] }));
}
const asked = () => global.fetch.mock.calls.map(([url]) => url);

describe("Pat's Open in Code Editor", () => {
  test('asks for a changed file as the board may show it, and the window gets [hidden] in place of the key', async () => {
    server();
    const onSpawn = jest.fn();
    render(<TaskView taskId="made-up-task" live={changed('config.js')} onSpawn={onSpawn} onNewTask={jest.fn()} />);
    fireEvent.click(screen.getByTestId('tab-changes'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open config.js in Code Editor' })); });
    expect(asked()).toEqual(['/api/cli-agents/tasks/made-up-task/file?path=config.js&board=1']);
    expect(onSpawn).toHaveBeenCalledWith('code_editor', { title: 'config.js · Claude Code', fileName: 'config.js', code: ON_BOARD, hiddenWords: true });
    expect(JSON.stringify(onSpawn.mock.calls)).not.toContain(KEY);
  });

  test('for every changed file asks each the same way; a file with no such word opens as it is, with no note', async () => {
    server();
    const onSpawn = jest.fn();
    render(<TaskView taskId="made-up-task" live={changed('config.js', 'README.md')} onSpawn={onSpawn} onNewTask={jest.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open in Code Editor' })); });
    expect(asked().sort()).toEqual([
      '/api/cli-agents/tasks/made-up-task/file?path=README.md&board=1',
      '/api/cli-agents/tasks/made-up-task/file?path=config.js&board=1',
    ]);
    expect(onSpawn).toHaveBeenCalledWith('code_editor', { title: 'README.md · Claude Code', fileName: 'README.md', code: '# Made-up shop\n' });
    expect(onSpawn).toHaveBeenCalledWith('code_editor', expect.objectContaining({ fileName: 'config.js', code: ON_BOARD, hiddenWords: true }));
  });

  test("keeps a file only Pat opens on Pat's screen, in no window", async () => {
    server();
    const onSpawn = jest.fn();
    render(<TaskView taskId="made-up-task" live={changed('.env')} onSpawn={onSpawn} onNewTask={jest.fn()} />);
    fireEvent.click(screen.getByTestId('tab-changes'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open .env in Code Editor' })); });
    expect(onSpawn).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-private-file')).toHaveTextContent(`MADE_UP_KEY=${KEY}`);
  });
});

describe('a Code Editor window the console opened on the board', () => {
  const win = { id: 'made-up-window', title: 'config.js · Claude Code', fileName: 'config.js', code: ON_BOARD };

  test('says why a word shows as [hidden], until none is left', () => {
    render(<CodeEditorWindow win={{ ...win, hiddenWords: true }} onUpdate={jest.fn()} />);
    expect(screen.getByTestId('code-hidden-words')).toHaveTextContent(HIDDEN_WORDS);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'export const madeUpKey = process.env.MADE_UP_KEY;\n' } });
    expect(screen.queryByTestId('code-hidden-words')).not.toBeInTheDocument();
  });

  test('any other window has no such note, even with [hidden] in its words', () => {
    render(<CodeEditorWindow win={win} onUpdate={jest.fn()} />);
    expect(screen.queryByTestId('code-hidden-words')).not.toBeInTheDocument();
  });
});
