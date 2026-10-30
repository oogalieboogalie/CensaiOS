/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// What a teammate's Agent Console shows when the server leaves out a step's
// words because it is on a file only this computer's owner opens
// (server/cli-agents/ownerOnlySteps.js): the step's title and plain words
// for why there is nothing more. Pat Example is the owner, Sam Example a
// teammate. All files and words are made up.
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logFailure: () => {},
  logToApp: () => {},
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { TranscriptItem } = await import('../src/components/agentConsole/Transcript.jsx');
const { TaskView } = await import('../src/components/agentConsole/TaskView.jsx');
const { CliApprovalCards } = await import('../src/components/agentConsole/CliApprovalCards.jsx');
const { HIDDEN_MARK, HIDDEN_WORDS, OWNER_ONLY_RAW, OWNER_ONLY_STEP } = await import('../shared/files/fileProblems.js');

afterEach(() => { cleanup(); delete global.fetch; });
window.HTMLElement.prototype.scrollIntoView = () => {};

function answer(data) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => data }));
}

describe("a step on a file only Pat opens, on Sam's screen", () => {
  test('a read shows its title and why, with no result to open', () => {
    render(<TranscriptItem item={{ id: 'i2', kind: 'read', title: 'Read .env', path: '.env', status: 'done', ownerOnly: true }} />);
    expect(screen.getByText('Read .env')).toBeInTheDocument();
    expect(screen.getByTestId('step-owner-only')).toHaveTextContent(OWNER_ONLY_STEP);
    expect(screen.queryByRole('button', { name: /Result/ })).not.toBeInTheDocument();
  });

  test('a command shows its title and why, without a command line', () => {
    const { container } = render(<TranscriptItem item={{ id: 'i4', kind: 'command', title: 'Add the made-up key', status: 'done', ownerOnly: true }} />);
    expect(screen.getByText('Add the made-up key')).toBeInTheDocument();
    expect(screen.getByTestId('step-owner-only')).toHaveTextContent(OWNER_ONLY_STEP);
    expect(container.querySelector('.ac-block-cmd')).toBeNull();
  });

  test('an ordinary step shows as it is, with no such words', () => {
    render(<TranscriptItem item={{ id: 'i9', kind: 'command', title: 'Run the made-up tests', command: 'npm test', output: 'Made-up tests pass', status: 'done' }} />);
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.queryByTestId('step-owner-only')).not.toBeInTheDocument();
  });
});

describe("where the agent repeats a key from such a file, on Sam's screen", () => {
  test('a message shows [hidden] in its place, and why under it', () => {
    render(<TranscriptItem item={{ id: 'm1', kind: 'message', text: `The made-up key is ${HIDDEN_MARK}. I will use it.`, hiddenWords: true }} />);
    expect(screen.getByText(`The made-up key is ${HIDDEN_MARK}. I will use it.`)).toBeInTheDocument();
    expect(screen.getByTestId('step-hidden-words')).toHaveTextContent(HIDDEN_WORDS);
  });

  test('a command shows why under its card; a step on such a file says only why it is empty', () => {
    render(<TranscriptItem item={{ id: 'i9', kind: 'command', title: 'Show config.js', command: 'cat config.js', output: `madeUpKey = '${HIDDEN_MARK}'`, status: 'done', hiddenWords: true }} />);
    expect(screen.getByTestId('step-hidden-words')).toHaveTextContent(HIDDEN_WORDS);
    cleanup();
    render(<TranscriptItem item={{ id: 'i2', kind: 'read', title: 'Read .env', path: '.env', status: 'done', ownerOnly: true, hiddenWords: true }} />);
    expect(screen.getByTestId('step-owner-only')).toBeInTheDocument();
    expect(screen.queryByTestId('step-hidden-words')).not.toBeInTheDocument();
  });

  test('an ordinary message has no such note', () => {
    render(<TranscriptItem item={{ id: 'm2', kind: 'message', text: 'Made-up tests pass.' }} />);
    expect(screen.queryByTestId('step-hidden-words')).not.toBeInTheDocument();
  });
});

describe('the raw output tab', () => {
  const live = {
    task: { id: 'made-up-task', title: 'Made-up task', cli: 'claudecode', cliLabel: 'Claude Code', status: 'done', worktree: { branch: 'made-up-branch' } },
    items: [], error: null, live: false, poll: async () => {}, loadChanges: () => {}, changes: { loaded: true, patch: '', files: [] },
  };
  const openRaw = async () => {
    render(<TaskView taskId="made-up-task" live={live} onSpawn={jest.fn()} onNewTask={jest.fn()} />);
    await act(async () => { fireEvent.click(screen.getByTestId('tab-raw')); });
  };

  test("on Sam's screen says why it is empty", async () => {
    answer({ lines: [], ownerOnly: true });
    await openRaw();
    expect(await screen.findByTestId('agent-raw-owner-only')).toHaveTextContent(OWNER_ONLY_RAW);
    expect(screen.queryByTestId('agent-raw')).not.toBeInTheDocument();
  });

  test("on Pat's screen shows the lines", async () => {
    answer({ lines: ['made-up raw line'] });
    await openRaw();
    expect(await screen.findByTestId('agent-raw')).toHaveTextContent('made-up raw line');
    expect(screen.queryByTestId('agent-raw-owner-only')).not.toBeInTheDocument();
  });

  test("Pat's hand-off to a chat agent asks for the diff and summary as the board may show them, since the chat sits on the shared board", async () => {
    const KEY = 'not-a-real-made-up-key';
    answer({ files: [{ path: 'notes.md', change: 'modified', additions: 1, deletions: 1 }], patch: 'diff --git a/notes.md b/notes.md\n+Made-up change', summary: 'Made-up summary\n./.env: …' });
    const onSpawn = jest.fn();
    // Pat's own screen has the summary as it is: here, with a line Copilot printed from a key file.
    const own = { ...live, task: { ...live.task, summary: `Made-up summary\n./.env:MADE_UP_KEY=${KEY}` } };
    render(<TaskView taskId="made-up-task" live={own} onSpawn={onSpawn} onNewTask={jest.fn()} />);
    fireEvent.click(screen.getByTestId('agent-handoff-open'));
    fireEvent.click(screen.getByRole('radio', { name: 'Chat agent' }));
    await act(async () => { fireEvent.click(screen.getByTestId('agent-handoff-send')); });
    expect(global.fetch.mock.calls.map(([url]) => url)).toContain('/api/cli-agents/tasks/made-up-task/changes?board=1');
    const { text } = onSpawn.mock.calls.find(([kind]) => kind === 'chat')[1].msgs[0];
    expect(text).toContain('+Made-up change');
    expect(text).toContain('Summary: Made-up summary\n./.env: …');
    expect(text).not.toContain(KEY);
  });
});

test('the summary says why a word shows as [hidden]', () => {
  const live = {
    task: { id: 'made-up-task', title: 'Made-up task', cli: 'claudecode', cliLabel: 'Claude Code', status: 'done', summary: `Done: config.js holds ${HIDDEN_MARK}.`, hiddenWords: true, worktree: { branch: 'made-up-branch' } },
    items: [], error: null, live: false, poll: async () => {}, loadChanges: () => {}, changes: { loaded: true, patch: '', files: [] },
  };
  render(<TaskView taskId="made-up-task" live={live} onSpawn={jest.fn()} onNewTask={jest.fn()} />);
  expect(screen.getByTestId('agent-summary')).toHaveTextContent(`Done: config.js holds ${HIDDEN_MARK}.`);
  expect(screen.getByTestId('summary-hidden-words')).toHaveTextContent(HIDDEN_WORDS);
});

test('Action Approvals shows Sam why a word in a request shows as [hidden]', async () => {
  answer({ permissions: [{ id: 'p2', taskId: 'made-up-task', cli: 'claudecode', cliLabel: 'Claude Code', taskTitle: 'Made-up task', title: 'Write config.js', kind: 'edit', detail: 'config.js', diff: { path: 'config.js', before: '', after: `madeUpKey = '${HIDDEN_MARK}'` }, hiddenWords: true }] });
  await act(async () => { render(<CliApprovalCards active={false} />); });
  expect(await screen.findByText('Claude Code: Write config.js')).toBeInTheDocument();
  expect(screen.getByTestId('approval-hidden-words')).toHaveTextContent(HIDDEN_WORDS);
});

test("Action Approvals shows Sam a request on such a file by its title and why", async () => {
  answer({ permissions: [{ id: 'p1', taskId: 'made-up-task', cli: 'claudecode', cliLabel: 'Claude Code', taskTitle: 'Made-up task', title: 'Write .env', kind: 'edit', detail: null, diff: null, ownerOnly: true }] });
  await act(async () => { render(<CliApprovalCards active={false} />); });
  expect(await screen.findByText('Claude Code: Write .env')).toBeInTheDocument();
  expect(screen.getByText(OWNER_ONLY_STEP)).toBeInTheDocument();
});
