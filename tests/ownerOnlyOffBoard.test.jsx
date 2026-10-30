/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// A file only this computer's owner may read (a .env, a key file) keeps its
// words on the owner's own screen: the windows never put them on the shared
// board, where everyone would get them, and a teammate's window shows none of
// what the board may still hold. Pat Example is the owner, Sam Example a
// teammate. All files and words are made up.
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logFailure: () => {},
  logToApp: () => {},
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { CodeEditorWindow } = await import('../src/components/CodeEditorWindow.jsx');
const { DocWindow } = await import('../src/components/DocWindow.jsx');
const { HtmlPreviewWindow } = await import('../src/components/HtmlPreviewWindow.jsx');
const { PrivateFileView } = await import('../src/components/agentConsole/PrivateFileView.jsx');
const { TaskView } = await import('../src/components/agentConsole/TaskView.jsx');
const { readTodoFile } = await import('../src/components/windows/stepCards/stepCardsApi.js');
const { StepCardsWindow } = await import('../src/components/windows/stepCards/index.jsx');
const { FILE_PROBLEMS, OFF_BOARD_NOTE, STEPS_OFF_BOARD } = await import('../shared/files/fileProblems.js');

const KEY = 'MADE_UP_KEY=not-a-real-made-up-key';
const FILE = '/made/up/project/made-up.env';

/** The server as Pat (the owner: the words, marked as Pat's alone) or Sam (a plain refusal) gets it. */
function serverAs(who, content = KEY) {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/files/backlinks')) return { ok: true, status: 200, json: async () => ({ results: [], capped: false }) };
    return who === 'pat'
      ? { ok: true, status: 200, json: async () => ({ content, ownerOnly: true }) }
      : { ok: false, status: 403, json: async () => ({ error: FILE_PROBLEMS.ownerOnly, reason: 'ownerOnly' }) };
  });
}

/** Every value onUpdate was called with, as text, to search for the words. */
const sent = (onUpdate) => JSON.stringify(onUpdate.mock.calls);

afterEach(() => { cleanup(); delete global.fetch; });
// jsdom has no scrolling; the agent console's transcript scrolls to its end.
window.HTMLElement.prototype.scrollIntoView = () => {};

describe('the Code editor', () => {
  const codeWin = (extra = {}) => ({ id: 'code-owner-only', fileName: 'made-up.env', filePath: FILE, language: 'text', ...extra });

  test("on Pat's screen shows the file and keeps it, and what Pat types, off the board; the board's old copy is emptied", async () => {
    serverAs('pat');
    const onUpdate = jest.fn();
    const { rerender } = render(<CodeEditorWindow win={codeWin({ code: 'Made-up words the board kept from before' })} onUpdate={onUpdate} />);
    expect(await screen.findByDisplayValue(KEY)).not.toHaveAttribute('readonly');
    expect(onUpdate).toHaveBeenCalledWith({ code: '' });
    expect(screen.getByTestId('off-board-note')).toHaveTextContent(OFF_BOARD_NOTE);
    // Preview would copy the words into a new window on the board.
    expect(screen.queryByRole('button', { name: /Preview/ })).not.toBeInTheDocument();
    fireEvent.change(document.querySelector('textarea'), { target: { value: `${KEY}\nMADE_UP_SECOND=typed-by-pat` } });
    expect(screen.getByDisplayValue(/typed-by-pat/)).toBeInTheDocument();
    expect(sent(onUpdate)).not.toMatch(/not-a-real|typed-by-pat/);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    // What the board says later does not replace the file's words on Pat's screen.
    rerender(<CodeEditorWindow win={codeWin({ code: 'Made-up words from the board' })} onUpdate={onUpdate} />);
    expect(screen.getByDisplayValue(/typed-by-pat/)).toBeInTheDocument();
  });

  test("on Sam's screen says only the owner opens it, shows none of what the board holds, then or later, and empties it", async () => {
    serverAs('sam');
    const onUpdate = jest.fn();
    const { rerender } = render(<CodeEditorWindow win={codeWin({ code: KEY })} onUpdate={onUpdate} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.ownerOnly);
    expect(document.querySelector('textarea').value).toBe('');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('off-board-note')).not.toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith({ code: '' });
    rerender(<CodeEditorWindow win={codeWin({ code: `${KEY}-again` })} onUpdate={onUpdate} />);
    expect(document.querySelector('textarea').value).toBe('');
    expect(sent(onUpdate)).not.toContain('not-a-real');
  });

  test("moving to another file drops the words of one only the owner may read before the next one loads", async () => {
    serverAs('pat');
    const onUpdate = jest.fn();
    const { rerender } = render(<CodeEditorWindow win={codeWin()} onUpdate={onUpdate} />);
    await screen.findByDisplayValue(KEY);
    global.fetch = jest.fn(() => new Promise(() => {})); // the next file has not come back yet
    rerender(<CodeEditorWindow win={codeWin({ fileName: 'notes.md', filePath: '/made/up/project/notes.md' })} onUpdate={onUpdate} />);
    expect(document.querySelector('textarea').value).toBe('');
    expect(document.body.textContent).not.toContain('not-a-real');
    expect(sent(onUpdate)).not.toContain('not-a-real');
  });

  test("Format keeps a file only the owner may read on Pat's screen", async () => {
    serverAs('pat', '{"madeUp":"not-a-real-made-up-key","alsoMadeUp":true}');
    const onUpdate = jest.fn();
    render(<CodeEditorWindow win={codeWin({ fileName: 'settings.json', filePath: '/made/up/project/.made-up/settings.json', language: 'json' })} onUpdate={onUpdate} />);
    await screen.findByDisplayValue(/not-a-real-made-up-key/);
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(await screen.findByText('Formatted')).toBeInTheDocument();
    expect(document.querySelector('textarea').value).toMatch(/^\{ "madeUp": "not-a-real-made-up-key", "alsoMadeUp": true \}\n?$/);
    expect(sent(onUpdate)).not.toContain('not-a-real');
  });
});

describe('the Document', () => {
  const docWin = (extra = {}) => ({ id: 'doc-owner-only', kind: 'doc', fileName: 'made-up-server.key', filePath: '/made/up/project/made-up-server.key', annotations: [], ...extra });
  const doc = (win, onUpdate) => <DocWindow win={win} onUpdate={onUpdate} onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />;
  const renderDoc = (win, onUpdate) => render(doc(win, onUpdate));

  test("on Pat's screen keeps what Pat types off the board, and empties what the board kept", async () => {
    serverAs('pat', 'MADE-UP PRIVATE KEY not-a-real-made-up-key');
    const onUpdate = jest.fn();
    renderDoc(docWin({ isEditing: true, text: 'Made-up words typed before' }), onUpdate);
    const box = await screen.findByDisplayValue(/MADE-UP PRIVATE KEY/);
    fireEvent.change(box, { target: { value: 'MADE-UP PRIVATE KEY not-a-real-made-up-key\nmade-up line typed by Pat' } });
    expect(screen.getByDisplayValue(/typed by Pat/)).toBeInTheDocument();
    expect(screen.getByTestId('off-board-note')).toHaveTextContent(OFF_BOARD_NOTE);
    expect(onUpdate).toHaveBeenCalledWith({ text: '' });
    expect(sent(onUpdate)).not.toMatch(/not-a-real|typed by Pat/);
  });

  test("moving to another file drops its words before the next one loads", async () => {
    serverAs('pat', 'MADE-UP PRIVATE KEY not-a-real-made-up-key');
    const onUpdate = jest.fn();
    const { rerender } = renderDoc(docWin({ isEditing: true }), onUpdate);
    await screen.findByDisplayValue(/MADE-UP PRIVATE KEY/);
    global.fetch = jest.fn(() => new Promise(() => {})); // the next file has not come back yet
    rerender(doc(docWin({ isEditing: true, fileName: 'notes.md', filePath: '/made/up/project/notes.md' }), onUpdate));
    expect(document.body.textContent).not.toContain('not-a-real');
    expect(document.querySelector('textarea')?.value || '').not.toContain('not-a-real');
    expect(sent(onUpdate)).not.toContain('not-a-real');
  });

  test("is not kept in this browser for whoever opens it next", async () => {
    serverAs('pat', 'MADE-UP PRIVATE KEY not-a-real-made-up-key');
    const first = renderDoc(docWin({ isEditing: true }), jest.fn());
    await screen.findByDisplayValue(/MADE-UP PRIVATE KEY/);
    first.unmount();
    // Sam opens it next in this browser, and the server has not answered yet.
    global.fetch = jest.fn(() => new Promise(() => {}));
    renderDoc(docWin({ isEditing: true }), jest.fn());
    expect(document.body.textContent).not.toContain('not-a-real');
    expect(document.querySelector('textarea')?.value || '').not.toContain('not-a-real');
  });

  test("on Sam's screen says only the owner opens it", async () => {
    serverAs('sam');
    renderDoc(docWin(), jest.fn());
    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.ownerOnly);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('off-board-note')).not.toBeInTheDocument();
  });
});

test("a Shared Preview of a file only the owner may read shows on Pat's screen, is not put on the board, and is read once", async () => {
  serverAs('pat', '<h1>Made-up page not-a-real-made-up-key</h1>');
  const onUpdate = jest.fn();
  const win = { id: 'preview-owner-only', filePath: '/made/up/project/.made-up/index.html' };
  let view;
  await act(async () => { view = render(<HtmlPreviewWindow win={win} onUpdate={onUpdate} />); });
  expect(document.querySelector('iframe').getAttribute('srcdoc')).toContain('Made-up page');
  expect(screen.getByTestId('off-board-note')).toHaveTextContent(OFF_BOARD_NOTE);
  // The board hands every window a new onUpdate on each change; that is no reason to read the file again.
  await act(async () => { view.rerender(<HtmlPreviewWindow win={{ ...win }} onUpdate={(p) => onUpdate(p)} />); });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(sent(onUpdate)).not.toContain('not-a-real');
});

test("a coding agent's file only the owner may read opens in the console on the owner's screen, never as a window on the board", async () => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('notes.md') ? { path: 'notes.md', content: 'Made-up note' } : { path: 'made up/.env', content: KEY, ownerOnly: true }),
  }));
  const live = {
    task: { id: 'made-up-task', title: 'Made-up task', cli: 'claudecode', cliLabel: 'Claude Code', status: 'done', worktree: { branch: 'made-up-branch' } },
    items: [], error: null, live: false, poll: async () => {}, loadChanges: () => {},
    changes: { loaded: true, patch: '', files: [{ path: 'made up/.env', change: 'added', additions: 1, deletions: 0 }, { path: 'notes.md', change: 'modified', additions: 1, deletions: 1 }] },
  };
  const onSpawn = jest.fn();
  const view = render(<TaskView taskId="made-up-task" live={live} onSpawn={onSpawn} onNewTask={jest.fn()} />);
  fireEvent.click(screen.getByTestId('tab-changes'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open made up/.env in Code Editor' })); });
  expect(screen.getByTestId('agent-private-file')).toHaveTextContent(KEY);
  expect(onSpawn).not.toHaveBeenCalled();
  // Switching to another task closes it.
  view.rerender(<TaskView taskId="made-up-task-2" live={live} onSpawn={onSpawn} onNewTask={jest.fn()} />);
  expect(screen.queryByTestId('agent-private-file')).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open notes.md in Code Editor' })); });
  expect(onSpawn).toHaveBeenCalledWith('code_editor', expect.objectContaining({ code: 'Made-up note' }));
});

test("a coding agent's file only the owner may read shows on the owner's screen only, and closes", () => {
  const onClose = jest.fn();
  render(<PrivateFileView file={{ path: 'made up/.env', content: KEY }} onClose={onClose} />);
  expect(screen.getByTestId('agent-private-file')).toHaveTextContent(KEY);
  expect(screen.getByText(OFF_BOARD_NOTE)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

const HIDDEN_PLAN = '/made/up/project/.made-up/plan.todo';
const PLAN_WORDS = 'censaiOS to-do file\n== Card 1: Made-up card not-a-real-made-up-key\n-- Step 1: Made-up step\n[ ] ask Made-up check';

test("Step cards never turn a file only the owner may read into cards on the board, even for Pat", async () => {
  serverAs('pat', PLAN_WORDS);
  await expect(readTodoFile({ filePath: HIDDEN_PLAN })).rejects.toMatchObject({ message: STEPS_OFF_BOARD, offBoard: true });
  serverAs('sam');
  await expect(readTodoFile({ filePath: HIDDEN_PLAN })).rejects.toMatchObject({ message: STEPS_OFF_BOARD, offBoard: true });
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: 'Made-up plan' }) }));
  await expect(readTodoFile({ filePath: '/made/up/project/plan.todo' })).resolves.toBe('Made-up plan');
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: FILE_PROBLEMS.missing, reason: 'missing' }) }));
  const missing = await readTodoFile({ filePath: '/made/up/project/gone.todo' }).catch((err) => err);
  expect(missing).toMatchObject({ message: FILE_PROBLEMS.missing });
  expect(missing.offBoard).toBeUndefined();
});

/** One window on a board two screens show: what either saves reaches both, as the board's sync does. */
function sharedBoard(start) {
  let win = start;
  const screens = new Set();
  return {
    get: () => win,
    update: (patch) => { win = { ...win, ...patch }; screens.forEach((show) => show(win)); },
    watch: (show) => { screens.add(show); return () => screens.delete(show); },
  };
}

function Screen({ board }) {
  const [win, setWin] = React.useState(board.get());
  React.useEffect(() => board.watch(setWin), [board]);
  return <StepCardsWindow win={win} onUpdate={board.update} />;
}

test("a .todo file two screens open at once turns into its cards once, not once for each screen", async () => {
  const plan = '/made/up/project/plan.todo';
  const words = 'censaiOS to-do file\n\n== Card 1: Made-up card for everyone\n\n-- Step 1: Made-up step\n[ ] ask Made-up check is done\n';
  const answers = [];
  global.fetch = jest.fn(() => new Promise((answer) => answers.push(answer)));
  const board = sharedBoard({ id: 'made-up-steps', filePath: plan });
  render(<><Screen board={board} /><Screen board={board} /></>);
  // Both screens read the file before either has marked it read.
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const file = { ok: true, status: 200, json: async () => ({ content: words }) };
  await act(async () => { answers[0](file); });
  await act(async () => { answers[1](file); });
  expect(board.get().cards.map((c) => c.title)).toEqual(['Card 1: Made-up card for everyone']);
});

/** A Step cards window on the board: what it saves on itself comes back to it, as the board does. */
function BoardStepCards({ start, saved }) {
  const [win, setWin] = React.useState(start);
  return <StepCardsWindow win={win} onUpdate={(patch) => { saved.push(patch); setWin((w) => ({ ...w, ...patch })); }} />;
}

test('Step cards say on every screen why such a file makes no cards, and still say it after a reload', async () => {
  for (const who of ['pat', 'sam']) {
    serverAs(who, PLAN_WORDS);
    const saved = [];
    render(<BoardStepCards start={{ id: 'made-up-steps', filePath: HIDDEN_PLAN }} saved={saved} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(STEPS_OFF_BOARD);
    expect(saved).toEqual([{ loadedFrom: HIDDEN_PLAN }, { offBoardFile: HIDDEN_PLAN }]);
    cleanup();
  }
  // After a reload the window, as the board kept it, reads nothing again and still says why.
  global.fetch = jest.fn();
  render(<BoardStepCards start={{ id: 'made-up-steps', filePath: HIDDEN_PLAN, loadedFrom: HIDDEN_PLAN, offBoardFile: HIDDEN_PLAN }} saved={[]} />);
  expect(screen.getByRole('alert')).toHaveTextContent(STEPS_OFF_BOARD);
  expect(global.fetch).not.toHaveBeenCalled();
  cleanup();
  // The mark is for that file only: the window on another file does not say it.
  render(<BoardStepCards start={{ id: 'made-up-steps', filePath: '/made/up/project/plan.todo', loadedFrom: '/made/up/project/plan.todo', offBoardFile: HIDDEN_PLAN }} saved={[]} />);
  expect(screen.queryByRole('alert')).toBeNull();
});
