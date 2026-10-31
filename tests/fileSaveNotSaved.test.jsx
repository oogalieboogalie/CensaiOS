/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const { saveProblem, saveFileContent } = await import('../src/components/files/fileSave.js');
const { SAVE_PROBLEMS, notSavedWords } = await import('../shared/files/fileProblems.js');
const { DocWindow } = await import('../src/components/DocWindow.jsx');
const { CodeEditorWindow } = await import('../src/components/CodeEditorWindow.jsx');

// A Save the server refused says so in plain words, in the Document and the
// Code editor alike, and what was typed stays on screen. The server's own text
// names its folders, so it never shows. All files and words are made up.
const SERVER_WORDS = "ENOENT: no such file or directory, open '/made/up/server/folder/plan.md'";
const NO_ANSWER = 'censaiOS did not answer. It may be restarting, so try again in a moment.';
const TYPED = 'Made-up line typed before Save';

/**
 * A made-up server: a file reads as made-up words, and a save gets
 * `answer(sent, options)`: a [status, body] pair (or a promise of one), or
 * 'no answer'. Saves that worked are kept in `saves`.
 */
function madeUpServer(answer) {
  const saves = [];
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (options?.method === 'PUT') {
      const sent = JSON.parse(options.body);
      const said = await answer(sent, options);
      if (said === 'no answer') throw new TypeError('Failed to fetch');
      const [status, body] = said;
      if (status === 200) saves.push(sent);
      return { ok: status >= 200 && status < 300, status, json: async () => (body === undefined ? Promise.reject(new SyntaxError('not JSON')) : body) };
    }
    if (target.startsWith('/api/files/content')) {
      const asked = new URL(target, 'http://made-up.test').searchParams.get('path');
      const content = asked.endsWith('.js') ? 'export const madeUp = 1;' : (asked.endsWith('links.md') ? 'Made-up plan, see [[Made-up Plan B]]' : 'Made-up plan');
      return { ok: true, status: 200, json: async () => ({ content }) };
    }
    if (target.includes('/api/files/backlinks')) return { ok: true, status: 200, json: async () => ({ results: [], capped: false }) };
    return { ok: true, status: 200, json: async () => [] };
  });
  return saves;
}
const refused = (status, reason) => () => [status, { error: SERVER_WORDS, reason }];
const saved = () => [200, { ok: true }];
/** Answers each save only when the test says, in the order it was sent. */
const heldAnswers = (answers) => () => new Promise((resolve) => { answers.push(resolve); });
const putsSent = () => global.fetch.mock.calls.filter(([, options]) => options?.method === 'PUT');

function renderDoc(name, more = {}) {
  render(<DocWindow win={{ id: `doc-${name}`, kind: 'doc', fileName: name, filePath: `/made/up/project/notes/${name}`, annotations: [], isEditing: true, ...more.win }}
    onUpdate={jest.fn()} onSpawn={more.onSpawn || jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
}

const codeWin = (name) => ({ id: `code-${name}`, fileName: name, filePath: `/made/up/project/notes/${name}`, language: 'javascript' });
const renderCode = (name) => render(<CodeEditorWindow win={codeWin(name)} onUpdate={jest.fn()} />);

/** Types into the window's file and presses its Save button. */
async function typeAndSave(shown, words) {
  fireEvent.change(await screen.findByDisplayValue(shown), { target: { value: words } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

function expectNoServerWords() {
  expect(document.body.textContent).not.toContain('/made/up/server');
  expect(document.body.textContent).not.toMatch(/ENOENT|no such file|the server said|undefined/);
}

describe('the words for a save that did not happen', () => {
  test.each([
    [404, 'gone', true, SAVE_PROBLEMS.gone, false],
    [403, 'outside', true, SAVE_PROBLEMS.outside, false],
    [403, 'denied', true, SAVE_PROBLEMS.denied, false],
    [409, 'busy', true, SAVE_PROBLEMS.busy, false],
    [409, 'exists', true, SAVE_PROBLEMS.exists, false],
    [403, 'secret', true, SAVE_PROBLEMS.secret, false],
    [403, 'owner-only', true, SAVE_PROBLEMS.ownerOnly, false],
    [400, 'folder', true, SAVE_PROBLEMS.folder, false],
    [507, 'full', true, SAVE_PROBLEMS.full, false],
    [507, 'fullCutShort', true, SAVE_PROBLEMS.fullCutShort, false],
    [403, 'filesOff', true, SAVE_PROBLEMS.filesOff, false],
    [500, 'unsaved', true, SAVE_PROBLEMS.unsaved, false],
    [403, undefined, false, 'You may not save this file here.', false],
    [401, undefined, false, 'Sign in again to save.', false],
    [413, undefined, false, SAVE_PROBLEMS.tooBig, false],
    [0, undefined, false, NO_ANSWER, true],
    [502, undefined, true, NO_ANSWER, true],
    [504, undefined, false, NO_ANSWER, true],
    // The page server's empty 500 while censaiOS restarts, and a 200 that is not censaiOS's.
    [500, undefined, false, NO_ANSWER, true],
    [200, undefined, false, NO_ANSWER, true],
    [404, undefined, true, SAVE_PROBLEMS.unsaved, false],
    [404, 'constructor', true, SAVE_PROBLEMS.unsaved, false],
    [500, SERVER_WORDS, true, SAVE_PROBLEMS.unsaved, false],
  ])('status %i with reason %p (answered by censaiOS: %p) says %p', (status, reason, answered, why, unsure) => {
    expect(saveProblem(status, reason, answered)).toEqual({ why, unsure });
  });

  test('a window says the file was not saved, why, and that the changes are still there', () => {
    expect(notSavedWords('plan.md', SAVE_PROBLEMS.gone))
      .toBe('plan.md was not saved. Its folder is not there. It may have been moved or deleted. Your changes are still here.');
    expect(notSavedWords('plan.md', NO_ANSWER, true))
      .toBe(`plan.md may not have been saved. ${NO_ANSWER} Your changes are still here.`);
  });

  test('only censaiOS saying it saved counts as saved', async () => {
    madeUpServer(() => [200, { madeUp: 'a page that is not censaiOS' }]);
    expect(await saveFileContent('/made/up/plan.md', 'words', 'doc')).toEqual({ ok: false, status: 200, reason: '', why: NO_ANSWER, unsure: true });
    madeUpServer(saved);
    expect(await saveFileContent('/made/up/plan.md', 'words', 'doc')).toEqual({ ok: true });
  });

  test('a save with no answer in time stops waiting, and says it may not have been saved', async () => {
    // Never answers; only stopping the request ends the wait.
    madeUpServer((sent, options) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }));
    expect(await saveFileContent('/made/up/plan.md', 'words', 'doc', { timeoutMs: 20 }))
      .toEqual({ ok: false, status: 0, reason: '', why: NO_ANSWER, unsure: true });
  });

  test('the app log gets the window kind, the status and a known reason only', async () => {
    logToApp.mockClear();
    madeUpServer(refused(404, 'gone'));
    await saveFileContent('/made/up/project/plan.md', 'Made-up words', 'doc');
    madeUpServer(refused(500, SERVER_WORDS));
    await saveFileContent('/made/up/project/tool.js', 'Made-up words', 'code_editor');
    madeUpServer(() => 'no answer');
    await saveFileContent('/made/up/project/tool.js', 'Made-up words', 'code_editor');
    madeUpServer(refused(409, 'exists'));
    await saveFileContent('/made/up/project/new.md', 'Made-up words', 'doc', { create: true });
    expect(logToApp.mock.calls.map((call) => [call[0], call[1], call[2]])).toEqual([
      ['warn', 'doc: file not saved (status 404, gone)', { where: 'doc' }],
      ['warn', 'code_editor: file not saved (status 500)', { where: 'code_editor' }],
      ['warn', 'code_editor: file not saved (status 0)', { where: 'code_editor' }],
    ]);
  });
});

describe('a Document whose Save did not save', () => {
  test.each([
    ['gone', refused(404, 'gone'), SAVE_PROBLEMS.gone, false],
    ['owner-only', refused(403, 'owner-only'), SAVE_PROBLEMS.ownerOnly, false],
    ['folder', refused(400, 'folder'), SAVE_PROBLEMS.folder, false],
    ['full', refused(507, 'full'), SAVE_PROBLEMS.full, false],
    ['no-answer', () => 'no answer', NO_ANSWER, true],
    ['proxy', () => [502, undefined], NO_ANSWER, true],
    ['restarting', () => [500, undefined], NO_ANSWER, true],
  ])('(%s) says so in plain words and keeps the words typed', async (name, answer, why, unsure) => {
    const saves = madeUpServer(answer);
    renderDoc(`${name}.md`);
    await typeAndSave('Made-up plan', TYPED);

    expect(await screen.findByRole('alert')).toHaveTextContent(notSavedWords(`${name}.md`, why, unsure));
    expect(screen.getByRole('textbox', { name: 'Document text' })).toHaveValue(TYPED);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(saves).toEqual([]);
    expectNoServerWords();
  });

  test('keeps saying so until a save works, then says it saved, for a moment', async () => {
    let answer = refused(404, 'gone');
    const saves = madeUpServer((sent) => answer(sent));
    renderDoc('until-saved.md');
    await typeAndSave('Made-up plan', TYPED);
    expect(await screen.findByRole('alert')).toHaveTextContent('until-saved.md was not saved.');

    answer = saved;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved until-saved.md.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saves).toEqual([{ path: '/made/up/project/notes/until-saved.md', content: TYPED }]);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 4000 });
  });

  test('Close takes the words away and leaves what was typed (a teammate\'s Save never works)', async () => {
    madeUpServer(refused(403, 'owner-only'));
    renderDoc('close.md');
    await typeAndSave('Made-up plan', TYPED);
    const note = await screen.findByRole('alert');
    expect(note).toHaveTextContent(notSavedWords('close.md', SAVE_PROBLEMS.ownerOnly));
    fireEvent.click(within(note).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Document text' })).toHaveValue(TYPED);
  });

  test('words that were not saved never show as the file when it opens again', async () => {
    madeUpServer(refused(404, 'gone'));
    renderDoc('reopen.md');
    await typeAndSave('Made-up plan', TYPED);
    await screen.findByRole('alert');
    cleanup();

    // The read never answers, so only words kept from this visit can show.
    global.fetch = jest.fn(() => new Promise(() => {}));
    renderDoc('reopen.md', { win: { isEditing: false } });
    expect(await screen.findByText('Made-up plan')).toBeInTheDocument();
    expect(screen.queryByText(TYPED)).not.toBeInTheDocument();
  });

  describe('a new note a link asks for', () => {
    let said;
    beforeEach(() => {
      said = jest.spyOn(window, 'alert').mockImplementation(() => {});
      jest.spyOn(window, 'confirm').mockImplementation(() => true);
    });
    afterEach(() => jest.restoreAllMocks());

    /** Clicks the made-up note's link to a note the search does not find; what onSpawn got. */
    async function clickLink() {
      const onSpawn = jest.fn();
      renderDoc('links.md', { win: { isEditing: false }, onSpawn });
      await waitFor(() => expect(document.querySelector('[data-wiki-link="Made-up Plan B"]')).toBeTruthy());
      fireEvent.mouseUp(document.querySelector('[data-wiki-link="Made-up Plan B"]'));
      return onSpawn;
    }
    const opened = ['doc', { fileName: 'Made-up Plan B.md', filePath: '/made/up/project/notes/Made-up Plan B.md' }];

    test('that could not be made says so in plain words, and does not open', async () => {
      madeUpServer(refused(403, 'owner-only'));
      const onSpawn = await clickLink();
      await waitFor(() => expect(said).toHaveBeenCalledWith(`Made-up Plan B.md was not created. ${SAVE_PROBLEMS.ownerOnly}`));
      expect(onSpawn).not.toHaveBeenCalled();
    });

    test('that was made opens, made as a new file only', async () => {
      const saves = madeUpServer(saved);
      const onSpawn = await clickLink();
      await waitFor(() => expect(onSpawn).toHaveBeenCalledWith(...opened));
      expect(saves).toEqual([{ path: '/made/up/project/notes/Made-up Plan B.md', content: '# Made-up Plan B\n\n', create: true }]);
      expect(said).not.toHaveBeenCalled();
    });

    test('that is already there (the search missed it) opens as it is, never written over', async () => {
      const saves = madeUpServer(refused(409, 'exists'));
      const onSpawn = await clickLink();
      await waitFor(() => expect(onSpawn).toHaveBeenCalledWith(...opened));
      expect(saves).toEqual([]);
      expect(said).not.toHaveBeenCalled();
    });
  });
});

describe('a Code editor whose Save did not save', () => {
  test.each([
    ['gone.js', refused(404, 'gone'), SAVE_PROBLEMS.gone, false],
    ['folder.js', refused(400, 'folder'), SAVE_PROBLEMS.folder, false],
    ['owner.js', refused(403, 'owner-only'), SAVE_PROBLEMS.ownerOnly, false],
    ['quiet.js', () => 'no answer', NO_ANSWER, true],
  ])('(%s) says so in plain words, never the server\'s own, and keeps the code', async (name, answer, why, unsure) => {
    madeUpServer(answer);
    renderCode(name);
    await typeAndSave('export const madeUp = 1;', 'export const madeUp = 2;');

    expect(await screen.findByRole('alert')).toHaveTextContent(notSavedWords(name, why, unsure));
    expect(screen.getByDisplayValue('export const madeUp = 2;')).toBeInTheDocument();
    expectNoServerWords();
  });

  test('Ctrl+S says so too, and a save that works says it saved', async () => {
    let answer = refused(404, 'gone');
    const saves = madeUpServer((sent) => answer(sent));
    renderCode('keys.js');
    const box = await screen.findByDisplayValue('export const madeUp = 1;');
    fireEvent.change(box, { target: { value: 'export const madeUp = 3;' } });
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(notSavedWords('keys.js', SAVE_PROBLEMS.gone));

    answer = saved;
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved keys.js.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saves).toEqual([{ path: '/made/up/project/notes/keys.js', content: 'export const madeUp = 3;' }]);
  });

  test('Ctrl+S while a save is on its way saves the newest code once that is answered, and only its answer shows', async () => {
    const answers = [];
    const saves = madeUpServer(heldAnswers(answers));
    renderCode('race.js');
    const box = await screen.findByDisplayValue('export const madeUp = 1;');
    fireEvent.change(box, { target: { value: 'export const madeUp = 5;' } });
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    fireEvent.change(box, { target: { value: 'export const madeUp = 6;' } });
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    expect(putsSent()).toHaveLength(1);

    answers[0]([409, { error: SERVER_WORDS, reason: 'busy' }]);
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    answers[1]([200, { ok: true }]);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved race.js.');
    expect(saves.map((sent) => sent.content)).toEqual(['export const madeUp = 6;']);
    expect(putsSent()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('when the newest of two saves is refused, it says so even though the first one saved', async () => {
    const answers = [];
    madeUpServer(heldAnswers(answers));
    renderCode('order.js');
    const box = await screen.findByDisplayValue('export const madeUp = 1;');
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    await waitFor(() => expect(answers).toHaveLength(1));
    fireEvent.change(box, { target: { value: 'export const madeUp = 8;' } });
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    answers[0]([200, { ok: true }]);
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1]([404, { error: SERVER_WORDS, reason: 'gone' }]);
    expect(await screen.findByRole('alert')).toHaveTextContent(notSavedWords('order.js', SAVE_PROBLEMS.gone));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('an answer about a file the window no longer shows is not said', async () => {
    const answers = [];
    madeUpServer(heldAnswers(answers));
    const { rerender } = renderCode('first.js');
    await typeAndSave('export const madeUp = 1;', 'export const madeUp = 7;');
    await waitFor(() => expect(answers).toHaveLength(1));
    rerender(<CodeEditorWindow win={{ ...codeWin('second.js'), id: 'code-first.js' }} onUpdate={jest.fn()} />);
    answers[0]([404, { error: SERVER_WORDS, reason: 'gone' }]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('was not saved');
  });

  test('a save that did not happen just after one that did keeps saying so', async () => {
    let answer = saved;
    madeUpServer((sent) => answer(sent));
    renderCode('twice.js');
    await typeAndSave('export const madeUp = 1;', 'export const madeUp = 4;');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved twice.js.');

    answer = refused(404, 'gone');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(notSavedWords('twice.js', SAVE_PROBLEMS.gone));
    // Longer than "Saved" stays up: the words about the save that did not happen stay.
    await new Promise((done) => { setTimeout(done, 3300); });
    expect(screen.getByRole('alert')).toHaveTextContent(notSavedWords('twice.js', SAVE_PROBLEMS.gone));
  });
});
