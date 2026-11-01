/**
 * @jest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logFailure: () => {},
  logToApp,
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { fileLoadMessage, readFileLoad, warnFileLoadFailed } = await import('../src/components/files/fileLoad.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');
const { DocWindow } = await import('../src/components/DocWindow.jsx');
const { CodeEditorWindow } = await import('../src/components/CodeEditorWindow.jsx');

// What a server error says: it names the server's folders, so it never shows.
const SERVER_WORDS = 'ENOENT: no such file or directory, open /made/up/server/folder/picnic.md';

describe('the words for a file that will not open', () => {
  test.each([
    [404, undefined, FILE_PROBLEMS.missing],
    [403, 'outside', FILE_PROBLEMS.outside],
    [403, 'denied', FILE_PROBLEMS.denied],
    [403, 'secret', FILE_PROBLEMS.secret],
    [403, 'filesOff', FILE_PROBLEMS.filesOff],
    [400, 'folder', FILE_PROBLEMS.folder],
    [403, undefined, 'You may not open this file here.'],
    [401, undefined, 'Sign in again to open this file.'],
    [0, undefined, 'censaiOS did not answer. It may be restarting, so try again in a moment.'],
    [500, 'unreadable', FILE_PROBLEMS.unreadable],
    [502, undefined, FILE_PROBLEMS.unreadable],
    [404, 'constructor', FILE_PROBLEMS.missing],
    [500, SERVER_WORDS, FILE_PROBLEMS.unreadable],
  ])('status %i with reason %p says %p', (status, reason, words) => {
    expect(fileLoadMessage(status, reason)).toBe(words);
  });

  test('the server\'s own text never becomes the message, and only a known reason is kept', async () => {
    const answer = (status, body) => ({ ok: false, status, json: async () => body });
    expect(await readFileLoad(answer(404, { error: SERVER_WORDS, reason: 'missing' })))
      .toEqual({ ok: false, status: 404, reason: 'missing', message: FILE_PROBLEMS.missing });
    expect(await readFileLoad(answer(403, { error: SERVER_WORDS, reason: SERVER_WORDS })))
      .toEqual({ ok: false, status: 403, reason: '', message: 'You may not open this file here.' });
  });

  test('the app log gets the window kind, the status and a known reason only', () => {
    logToApp.mockClear();
    warnFileLoadFailed('doc', 404, 'missing');
    warnFileLoadFailed('code_editor', 403, SERVER_WORDS);
    expect(logToApp.mock.calls.map((call) => call[1])).toEqual([
      'doc: file failed to load (status 404, missing)',
      'code_editor: file failed to load (status 403)',
    ]);
  });
});

/**
 * A made-up server: `files` maps each path to its words, and saves land there;
 * `problems` maps a path to the [status, reason] it answers; any other path is gone.
 */
function madeUpServer(files = {}, problems = {}) {
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (options?.method === 'PUT') {
      const sent = JSON.parse(options.body);
      files[sent.path] = sent.content;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (target.startsWith('/api/files/content') || target.startsWith('/api/github/file')) {
      const filePath = new URL(target, 'http://made-up.test').searchParams.get('path');
      if (Object.hasOwn(files, filePath)) return { ok: true, status: 200, json: async () => ({ content: files[filePath] }) };
      // The GitHub reader sends no reason; its 404 still means the file is gone.
      const [status, reason] = problems[filePath] || [404, target.startsWith('/api/github/file') ? undefined : 'missing'];
      return { ok: false, status, json: async () => ({ error: SERVER_WORDS, reason }) };
    }
    if (target.includes('/api/files/backlinks')) return { ok: true, status: 200, json: async () => ({ results: [], capped: false }) };
    return { ok: true, status: 200, json: async () => [] };
  });
  return files;
}

function renderDoc(win) {
  render(<DocWindow win={{ kind: 'doc', fileName: 'picnic.md', annotations: [], ...win }}
    onUpdate={jest.fn()} onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
}

test('a Document whose file is gone says so in plain words, and "Try again" opens it once it is back', async () => {
  const files = madeUpServer();
  renderDoc({ id: 'doc-gone', filePath: '/made/up/doc-gone/picnic.md' });

  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
  expect(document.body.textContent).not.toContain('ENOENT');
  expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();

  files['/made/up/doc-gone/picnic.md'] = 'Made-up note: the picnic moves to Friday.';
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Made-up note: the picnic moves to Friday.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
});

test('a Document opened for editing on a file that is gone does not invite typing', async () => {
  madeUpServer();
  renderDoc({ id: 'doc-gone-editing', filePath: '/made/up/doc-gone/editing.md', isEditing: true });
  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
  const box = screen.getByRole('textbox', { name: 'Document text' });
  expect(box).toHaveAttribute('readonly');
  expect(box).not.toHaveAttribute('placeholder', 'Start typing…');
});

test('a Document from GitHub whose file is gone says the same', async () => {
  madeUpServer();
  renderDoc({ id: 'doc-github-gone', filePath: 'notes/made-up-gone.md', isGithub: true, githubRepo: 'made-up/repo' });
  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
});

test.each([
  ['a folder opened as a Document', '/made/up/folder', 400, 'folder'],
  ["a file in censaiOS's own folder of keys", '/made/up/.homebase-state/generated-secrets.env', 403, 'secret'],
])('%s says so, with no "Try again" that could never help', async (_what, filePath, status, reason) => {
  madeUpServer({}, { [filePath]: [status, reason] });
  renderDoc({ id: `doc-${reason}`, filePath });
  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS[reason]);
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

describe('a Document opened again on a file it read before', () => {
  test('says the file is gone once it was deleted, not the words it read before', async () => {
    const note = '/made/up/reopen/deleted.md';
    const files = madeUpServer({ [note]: 'Made-up words from before' });
    renderDoc({ id: 'doc-deleted-1', filePath: note });
    expect(await screen.findByText('Made-up words from before')).toBeInTheDocument();
    cleanup();

    delete files[note];
    renderDoc({ id: 'doc-deleted-2', filePath: note });
    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
    expect(screen.queryByText('Made-up words from before')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  test('shows the file\'s new words once it was changed', async () => {
    const note = '/made/up/reopen/changed.md';
    const files = madeUpServer({ [note]: 'Made-up words from before' });
    renderDoc({ id: 'doc-changed-1', filePath: note });
    expect(await screen.findByText('Made-up words from before')).toBeInTheDocument();
    cleanup();

    files[note] = 'Made-up words changed since';
    renderDoc({ id: 'doc-changed-2', filePath: note });
    expect(await screen.findByText('Made-up words changed since')).toBeInTheDocument();
    expect(screen.queryByText('Made-up words from before')).not.toBeInTheDocument();
  });

  test('shows the words it saved at once, before the file is read again', async () => {
    const note = '/made/up/reopen/saved.md';
    const files = madeUpServer({ [note]: 'Made-up words from before' });
    renderDoc({ id: 'doc-saved-1', filePath: note, isEditing: true });
    fireEvent.change(await screen.findByDisplayValue('Made-up words from before'), { target: { value: 'Made-up words saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(files[note]).toBe('Made-up words saved'));
    cleanup();

    // The read never answers, so only the words kept from the save can show.
    global.fetch = jest.fn(() => new Promise(() => {}));
    renderDoc({ id: 'doc-saved-2', filePath: note });
    expect(await screen.findByText('Made-up words saved')).toBeInTheDocument();
  });

  test('keeps words typed while the file is read again, even when it turns out to be gone', async () => {
    const note = '/made/up/reopen/typed.md';
    madeUpServer({ [note]: 'Made-up words from before' });
    renderDoc({ id: 'doc-typed-1', filePath: note });
    expect(await screen.findByText('Made-up words from before')).toBeInTheDocument();
    cleanup();

    // The read answers only once the words were typed.
    let answer;
    global.fetch = jest.fn(async (url) => {
      const target = String(url);
      if (target.startsWith('/api/files/content')) return new Promise((resolve) => { answer = resolve; });
      if (target.includes('/api/files/backlinks')) return { ok: true, status: 200, json: async () => ({ results: [], capped: false }) };
      return { ok: true, status: 200, json: async () => [] };
    });
    renderDoc({ id: 'doc-typed-2', filePath: note, isEditing: true });
    fireEvent.change(await screen.findByDisplayValue('Made-up words from before'), { target: { value: 'Made-up words typed meanwhile' } });
    await waitFor(() => expect(answer).toBeDefined());
    answer({ ok: false, status: 404, json: async () => ({ error: SERVER_WORDS, reason: 'missing' }) });

    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
    expect(screen.getByRole('textbox', { name: 'Document text' })).toHaveValue('Made-up words typed meanwhile');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

test('a Code editor whose file is gone says so, takes no typing or Format, and "Try again" opens it once it is back', async () => {
  const files = madeUpServer();
  render(<CodeEditorWindow win={{ id: 'code-gone', fileName: 'tool.js', filePath: '/made/up/code-gone/tool.js', language: 'javascript', code: 'KEEP_THIS' }}
    onUpdate={jest.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
  expect(screen.getByDisplayValue('KEEP_THIS')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();

  files['/made/up/code-gone/tool.js'] = 'export const madeUp = 1;';
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByDisplayValue('export const madeUp = 1;')).not.toHaveAttribute('readonly');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Format' })).toBeEnabled();
});

test('a Code editor opened on a file that is gone shows no sample code, as if it were the file', async () => {
  madeUpServer();
  render(<CodeEditorWindow win={{ id: 'code-gone-new', fileName: 'gone.js', filePath: '/made/up/code-gone/gone.js', language: 'javascript' }}
    onUpdate={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(FILE_PROBLEMS.missing);
  expect(document.querySelector('textarea').value).toBe('');
});
