/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilesWindow } from '../src/components/FilesWindow.jsx';
import { CATCH_UP_MS } from '../src/components/files/useCatchUp.js';
import { useWorkspaceStore } from '../src/lib/store.js';

// Files catches up with what another program (the computer's own file
// manager, say) adds, deletes or puts back in a folder it shows: every few
// seconds while the app is in view, and at once when a folder is opened
// again, the window is used again or the app comes back into view. All
// folders and files are made up.

const ROOT = '/made-up-project';
const DOCS = `${ROOT}/docs`;
const entry = (folder, name, isDir = false) => ({ name, isDir, path: `${folder}/${name}` });
let disk;
let asked;

/** Notes what was asked: where, and for which folder. */
function ask(url) {
  const [where, query] = String(url).split('?');
  const folder = new URLSearchParams(query).get('path') || '';
  asked.push({ where, folder });
  return folder;
}

/** The made-up server: lists what is on the made-up disk when asked, or says the folder is not there. */
function serve(url) {
  const folder = ask(url);
  if (!(folder in disk)) {
    return { ok: false, status: 404, json: async () => ({ error: `This folder doesn't exist: ${folder}`, reason: 'missing' }) };
  }
  const children = disk[folder];
  return { ok: true, status: 200, json: async () => ({ children }) };
}

const relists = (folder) => asked.filter((a) => a.where === '/api/files/relist' && a.folder === folder).length;
// A row reads "📄 name".
const shows = (name) => screen.queryByText((text) => text.endsWith(` ${name}`)) !== null;
const filesWindow = (props = {}) => <FilesWindow win={{ id: 'w-files', kind: 'files', mode: 'local', dirPath: ROOT }} onUpdate={jest.fn()} wins={[]} {...props} />;

/** Lets the answers already asked for arrive. */
const settle = () => act(async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); });
/** Lets time pass a second at a time, as in a browser: each catch-up is answered before the next. */
const wait = async (ms) => {
  for (let left = ms; left > 0; left -= 1000) {
    await act(async () => { jest.advanceTimersByTime(Math.min(1000, left)); });
    await settle();
  }
};
const useAgain = () => act(async () => { window.dispatchEvent(new Event('focus')); });
const clickFolder = (name) => fireEvent.click(screen.getByText((text) => text.endsWith(` ${name}`)));

function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

beforeEach(() => {
  jest.useFakeTimers();
  setHidden(false);
  useWorkspaceStore.setState({ wins: [] });
  disk = {
    [ROOT]: [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-notes.md'), entry(ROOT, 'made-up-old-list.md')],
    [DOCS]: [entry(DOCS, 'made-up-plan.md')],
  };
  asked = [];
  global.fetch = jest.fn(async (url) => serve(url));
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

/** Files on the made-up project, with its docs folder opened. */
async function openWithDocs(props) {
  const view = render(filesWindow(props));
  await settle();
  expect(shows('made-up-notes.md')).toBe(true);
  clickFolder('docs');
  await settle();
  expect(shows('made-up-plan.md')).toBe(true);
  return view;
}

/** Holds each catch-up's answer (the disk as it was when asked) until let go. */
function holdCatchUps() {
  const held = [];
  global.fetch = jest.fn((url) => {
    const reply = serve(url);
    if (!String(url).startsWith('/api/files/relist')) return Promise.resolve(reply);
    return new Promise((resolve) => { held.push(() => resolve(reply)); });
  });
  return held;
}
const letGo = async (held) => { await act(async () => { held.splice(0).forEach((answer) => answer()); }); await settle(); };

test('a file added and one deleted outside censaiOS show in an open folder without pressing anything, keeping what is expanded', async () => {
  await openWithDocs();
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-notes.md'), entry(ROOT, 'made-up-new-list.md')];
  disk[DOCS] = [entry(DOCS, 'made-up-plan.md'), entry(DOCS, 'made-up-later.md')];

  await wait(CATCH_UP_MS - 100);
  expect(shows('made-up-new-list.md')).toBe(false);
  await wait(100);
  expect(shows('made-up-new-list.md')).toBe(true);
  expect(shows('made-up-old-list.md')).toBe(false);
  // docs stays open and catches up too.
  expect(shows('made-up-plan.md')).toBe(true);
  expect(shows('made-up-later.md')).toBe(true);
  // Opening a folder is asked at browse; catching up at relist, which the server logs quietly.
  expect(asked.filter((a) => a.where === '/api/files/browse').map((a) => a.folder)).toEqual([ROOT, DOCS]);
  expect([relists(ROOT), relists(DOCS)]).toEqual([1, 1]);
});

test('a folder that said "Empty folder" lists the files put back in it', async () => {
  disk[ROOT] = [];
  render(filesWindow());
  await settle();
  expect(screen.getByTestId('tree-folder-note')).toHaveTextContent('Empty folder');
  disk[ROOT] = [entry(ROOT, 'made-up-notes.md')];
  await wait(CATCH_UP_MS);
  expect(shows('made-up-notes.md')).toBe(true);
  expect(screen.queryByTestId('tree-folder-note')).toBeNull();
});

test('a folder opened again, the window used again, or the app back in view catches up at once', async () => {
  const view = await openWithDocs({ isActive: true });
  clickFolder('docs');
  disk[DOCS] = [entry(DOCS, 'made-up-reopened.md')];
  clickFolder('docs');
  await settle();
  expect(shows('made-up-reopened.md')).toBe(true);
  expect(shows('made-up-plan.md')).toBe(false);

  // Another window was used, then this one again.
  view.rerender(filesWindow({ isActive: false }));
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-used-again.md')];
  view.rerender(filesWindow({ isActive: true }));
  await settle();
  expect(shows('made-up-used-again.md')).toBe(true);

  // Back from another program.
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-back.md')];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await settle();
  expect(shows('made-up-back.md')).toBe(true);
});

test('while the app is out of view nothing is asked; coming back into view catches up', async () => {
  await openWithDocs();
  setHidden(true);
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-while-away.md')];
  await wait(CATCH_UP_MS * 6);
  expect(relists(ROOT)).toBe(0);
  setHidden(false);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await settle();
  expect(shows('made-up-while-away.md')).toBe(true);
});

test('a folder deleted outside says so, is not asked about every few seconds, and lists again once it is back and used', async () => {
  await openWithDocs();
  const before = disk[ROOT];
  delete disk[ROOT];
  delete disk[DOCS];
  await wait(CATCH_UP_MS);
  expect(screen.getByTestId('tree-folder-note')).toHaveTextContent(`This folder doesn't exist: ${ROOT}`);
  expect(shows('made-up-notes.md')).toBe(false);

  await wait(CATCH_UP_MS * 6);
  expect(relists(ROOT)).toBe(1);

  disk[ROOT] = before;
  await useAgain();
  await settle();
  expect(shows('made-up-notes.md')).toBe(true);
  expect(screen.queryByTestId('tree-folder-note')).toBeNull();
});

test('a folder missing when Files opens is asked once more, then waits until the window is used again', async () => {
  const before = disk[ROOT];
  delete disk[ROOT];
  render(filesWindow());
  await settle();
  expect(screen.getByTestId('tree-folder-note')).toHaveTextContent(`This folder doesn't exist: ${ROOT}`);
  await wait(CATCH_UP_MS * 6);
  expect(relists(ROOT)).toBe(1);
  disk[ROOT] = before;
  await useAgain();
  await settle();
  expect(shows('made-up-notes.md')).toBe(true);
});

test('a subfolder gone for a moment (a program putting it back) lists again by itself', async () => {
  await openWithDocs();
  const before = disk[DOCS];
  // The project's list still has docs, but docs itself is gone when asked.
  delete disk[DOCS];
  await wait(CATCH_UP_MS);
  expect(screen.getByTestId('tree-folder-note')).toHaveTextContent(`This folder doesn't exist: ${DOCS}`);
  disk[DOCS] = [...before, entry(DOCS, 'made-up-put-back.md')];
  await wait(CATCH_UP_MS);
  expect(shows('made-up-put-back.md')).toBe(true);
  expect(screen.queryByTestId('tree-folder-note')).toBeNull();
});

test('a folder this person may not open says why and waits until the window is used again', async () => {
  await openWithDocs();
  global.fetch = jest.fn(async (url) => { ask(url); return { ok: false, status: 403, json: async () => ({ error: 'Made-up refusal: not yours to open' }) }; });
  await wait(CATCH_UP_MS * 4);
  expect(screen.getAllByText('Made-up refusal: not yours to open').length).toBeGreaterThan(0);
  expect(shows('made-up-notes.md')).toBe(false);
  expect(relists(ROOT)).toBe(1);

  global.fetch = jest.fn(async (url) => serve(url));
  await useAgain();
  await settle();
  expect(shows('made-up-notes.md')).toBe(true);
});

test('no answer (censaiOS restarting, say) keeps the list, and the next catch-up still comes', async () => {
  await openWithDocs();
  global.fetch = jest.fn(async (url) => { ask(url); throw new TypeError('Failed to fetch'); });
  await wait(CATCH_UP_MS);
  expect(relists(ROOT)).toBe(1);
  expect(shows('made-up-notes.md')).toBe(true);
  global.fetch = jest.fn(async (url) => serve(url));
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-after-restart.md')];
  await wait(CATCH_UP_MS);
  expect(shows('made-up-after-restart.md')).toBe(true);
});

test.each([
  ['a proxy in front of censaiOS', 502, async () => ({ error: 'Made-up gateway' })],
  ['the page server while censaiOS restarts', 500, async () => { throw new SyntaxError('Unexpected end of JSON input'); }],
])('an answer from %s keeps the list and keeps catching up', async (_who, status, json) => {
  await openWithDocs();
  global.fetch = jest.fn(async (url) => { ask(url); return { ok: false, status, json }; });
  await wait(CATCH_UP_MS * 3);
  expect(relists(ROOT)).toBe(3);
  expect(shows('made-up-notes.md')).toBe(true);
  expect(screen.queryByTestId('tree-folder-note')).toBeNull();
  global.fetch = jest.fn(async (url) => serve(url));
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-after-restart.md')];
  await wait(CATCH_UP_MS);
  expect(shows('made-up-after-restart.md')).toBe(true);
});

test('any other refusal keeps the list and waits until the window is used again', async () => {
  await openWithDocs();
  global.fetch = jest.fn(async (url) => { ask(url); return { ok: false, status: 500, json: async () => ({ error: 'Made-up failure' }) }; });
  await wait(CATCH_UP_MS * 4);
  expect(relists(ROOT)).toBe(1);
  expect(shows('made-up-notes.md')).toBe(true);
  expect(screen.queryByText(/Made-up failure/)).toBeNull();

  global.fetch = jest.fn(async (url) => serve(url));
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-used.md')];
  await useAgain();
  await settle();
  expect(shows('made-up-used.md')).toBe(true);
});

test('an answer that is not a list keeps the list, and the next catch-up still comes', async () => {
  await openWithDocs();
  global.fetch = jest.fn(async (url) => { ask(url); return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }; });
  await wait(CATCH_UP_MS * 2);
  expect(relists(ROOT)).toBe(2);
  expect(shows('made-up-notes.md')).toBe(true);
  expect(screen.queryByTestId('tree-folder-note')).toBeNull();
});

test('a folder still being asked about is not asked again on top', async () => {
  await openWithDocs();
  const held = holdCatchUps();
  await wait(CATCH_UP_MS * 3);
  expect(held).toHaveLength(2); // the project and its docs folder, once each
  await letGo(held);
  expect([relists(ROOT), relists(DOCS)]).toEqual([1, 1]);
});

test('used again while still being asked: asked once more when the answer comes, for the latest', async () => {
  await openWithDocs();
  const held = holdCatchUps();
  await wait(CATCH_UP_MS);
  expect(held).toHaveLength(2);
  disk[ROOT] = [entry(ROOT, 'docs', true), entry(ROOT, 'made-up-notes.md'), entry(ROOT, 'made-up-latest.md')];
  await useAgain();
  await settle();
  expect(held).toHaveLength(2);
  await letGo(held);
  expect(shows('made-up-latest.md')).toBe(false); // the answer asked before it was added
  expect(held).toHaveLength(2); // asked once more, each
  await letGo(held);
  expect(shows('made-up-latest.md')).toBe(true);
  expect([relists(ROOT), relists(DOCS)]).toEqual([2, 2]);
});

test('a GitHub folder is not asked again every few seconds', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ children: [{ name: 'README.md', isDir: false, path: 'README.md' }] }) }));
  render(<FilesWindow win={{ id: 'w-files', kind: 'files', mode: 'github', githubRepo: 'made-up/repo' }} onUpdate={jest.fn()} wins={[]} />);
  await settle();
  expect(shows('README.md')).toBe(true);
  const first = global.fetch.mock.calls.length;
  await wait(CATCH_UP_MS * 4);
  expect(global.fetch.mock.calls.length).toBe(first);
});
