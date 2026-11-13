/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FinderFilesWindow } from '../src/components/windows/finderFiles/index.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { visibleCanvasRect } from '../src/lib/freeSpot.js';
import { isProjectAware, pinWindowsToProject } from '../src/lib/windowProject.js';
import {
  FINDER_WORDS, finderCrumbs, finderProblem, formatModified, formatSize,
} from '../src/components/windows/finderFiles/finderFormat.js';

// The Finder lists the files of its window's project, as the server reads
// the folder (tests/finderBrowse.test.js), and opens them the way Files does.
// All folders and files are made up.
const ROOT = '/made-up/projects/garden-plan';
const NOTES = `${ROOT}/made-up-notes`;
const EMPTY = `${ROOT}/made-up-empty`;
const HOUR = 3_600_000;
const NOW = Date.now();
const file = (folder, name, size, ago) => ({ name, isDir: false, path: `${folder}/${name}`, size, modified: NOW - ago });
const dir = (folder, name, ago) => ({ name, isDir: true, path: `${folder}/${name}`, modified: NOW - ago });

let tree;
let calls;
let gone;
let role;
beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  role = 'admin';
  tree = {
    [ROOT]: [dir(ROOT, 'made-up-empty', HOUR), dir(ROOT, 'made-up-notes', 2 * HOUR), file(ROOT, 'made-up-plan.md', 52, HOUR), file(ROOT, 'made-up-tool.js', 4321, 30 * HOUR)],
    [NOTES]: [file(NOTES, 'made-up-list.md', 1_500_000, 400 * 24 * HOUR)],
    [EMPTY]: [],
  };
  gone = new Set();
  calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (url === '/api/auth/session') return reply(200, { user: { role } });
    if (url.startsWith('/api/files/browse')) {
      const folder = new URL(url, 'http://made-up.invalid').searchParams.get('path');
      if (gone.has(folder) || !tree[folder]) return reply(404, { error: `This folder doesn't exist: ${folder}`, reason: 'missing' });
      return reply(200, { path: folder, children: tree[folder] });
    }
    if (url.startsWith('/api/files/folders')) {
      const places = [{ name: 'Home', path: '/made-up', mountPath: '/made-up' }];
      if (!url.includes('path=')) return reply(200, { places });
      const asked = decodeURIComponent(url.split('path=')[1]);
      const folders = asked === '/made-up' ? [{ name: 'garden-plan', path: ROOT, mountPath: ROOT }] : [];
      return reply(200, { places, path: asked, mountPath: asked, name: asked.split('/').pop(), parent: asked === '/made-up' ? null : '/made-up', folders });
    }
    if (url === '/api/projects/open') return reply(200, { project: { id: 'made-up-id', name: 'garden-plan', path: ROOT } });
    return reply(404, {});
  });
});

const PROJECT = { type: 'local', name: 'garden-plan', path: ROOT };

function Finder(props) {
  return <FinderFilesWindow win={{ id: 'finder-1', kind: 'finderFiles' }} onUpdate={jest.fn()} onSpawn={jest.fn()} onSelect={jest.fn()} currentProject={PROJECT} isActive {...props} />;
}

/** The rows shown, as [name, date, size]. */
const rows = () => screen.queryAllByTestId('finder-row').map((row) => [...row.children].map((cell) => cell.textContent));
const names = () => rows().map(([name]) => name);
const waitForNames = (expected) => waitFor(() => expect(names()).toEqual(expected));
const row = (name) => screen.getAllByTestId('finder-row').find((r) => r.textContent.includes(name));
const toolbar = () => screen.getByLabelText(/files$/).querySelector('.hb-finder-toolbar-title').textContent;
const ROOT_NAMES = ['made-up-empty', 'made-up-notes', 'made-up-plan.md', 'made-up-tool.js'];
/** Whether a window sits wholly on screen where the board is now. */
const inView = (win) => {
  const { pan, zoom } = useWorkspaceStore.getState();
  const view = visibleCanvasRect({ pan, zoom, width: window.innerWidth, height: window.innerHeight });
  return win.x >= view.x && win.y >= view.y && win.x + win.w <= view.x + view.w && win.y + win.h <= view.y + view.h;
};

describe('the Finder', () => {
  test("lists its project's folder as the server reads it: folders first, real sizes and dates, nothing made up", async () => {
    render(<Finder />);
    await waitForNames(ROOT_NAMES);
    expect(rows()).toEqual(tree[ROOT].map((item) => [item.name, formatModified(item.modified), item.isDir ? '--' : formatSize(item.size)]));
    expect(rows()[2]).toEqual(['made-up-plan.md', formatModified(NOW - HOUR), '52 bytes']);
    expect(rows()[3][2]).toBe('4 KB');
    expect(calls[0].url).toBe(`/api/files/browse?path=${encodeURIComponent(ROOT)}&details=1`);
    const sidebar = within(screen.getByLabelText('Finder sidebar'));
    expect(sidebar.getByRole('button', { name: 'garden-plan' })).toHaveAttribute('data-active', 'true');
    expect(sidebar.getAllByRole('button').map((b) => b.textContent)).toEqual(['garden-plan', 'made-up-empty', 'made-up-notes']);
    expect(screen.getByLabelText('Path')).toHaveTextContent('garden-plan4 items');
    expect(screen.queryByText(/Downloads|AirDrop|officepc|nectarine|Favorites|Tags/)).toBeNull();
  });

  test('a double-click opens a file in its window as Files does; one already open is brought forward, the board gliding over to it', async () => {
    const onSpawn = jest.fn();
    const onSelect = jest.fn();
    const { rerender } = render(<Finder onSpawn={onSpawn} onSelect={onSelect} />);
    await waitForNames(ROOT_NAMES);
    fireEvent.click(row('made-up-plan.md'));
    expect(row('made-up-plan.md')).toHaveAttribute('data-selected', 'true');
    expect(onSpawn).not.toHaveBeenCalled();
    fireEvent.doubleClick(row('made-up-plan.md'));
    expect(onSpawn).toHaveBeenLastCalledWith('doc', expect.objectContaining({ fileName: 'made-up-plan.md', filePath: `${ROOT}/made-up-plan.md`, isEditing: true, isGithub: false }));
    fireEvent.keyDown(row('made-up-tool.js'), { key: 'Enter' });
    expect(onSpawn).toHaveBeenLastCalledWith('code_editor', expect.objectContaining({ filePath: `${ROOT}/made-up-tool.js`, language: 'js' }));

    // On the board, a window's `wins` prop holds only where windows are: the Finder reads the board's own list.
    // The open note sits past the right edge of the screen.
    onSpawn.mockClear();
    const note = { id: 'made-up-doc', kind: 'doc', filePath: `${ROOT}/made-up-plan.md`, isEditing: true, x: 2400, y: 64, w: 520, h: 250 };
    rerender(<Finder onSpawn={onSpawn} onSelect={onSelect} wins={[{ id: 'made-up-doc', x: 2400, y: 64, w: 520, h: 250 }]} />);
    act(() => { useWorkspaceStore.setState({ wins: [note], pan: { x: 0, y: 0 }, zoom: 1 }); });
    fireEvent.doubleClick(row('made-up-plan.md'));
    expect(onSelect).toHaveBeenCalledWith('made-up-doc');
    expect(onSpawn).not.toHaveBeenCalled();
    await waitFor(() => expect(inView(note)).toBe(true));
  });

  test('a double-click on a folder shows its files; Back, Forward, the path bar and the sidebar move between folders', async () => {
    const onUpdate = jest.fn();
    render(<Finder onUpdate={onUpdate} />);
    await waitForNames(ROOT_NAMES);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    fireEvent.doubleClick(row('made-up-notes'));
    await waitForNames(['made-up-list.md']);
    expect(rows()[0][2]).toBe('1.5 MB');
    expect(rows()[0][1]).toMatch(/\d{4} at /);
    expect(toolbar()).toBe('made-up-notes');
    expect(screen.getByLabelText('Path')).toHaveTextContent('garden-plan›made-up-notes1 item');
    expect(within(screen.getByLabelText('Finder sidebar')).getByRole('button', { name: 'made-up-notes' })).toHaveAttribute('data-active', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitForNames(ROOT_NAMES);
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await waitForNames(['made-up-list.md']);
    fireEvent.click(within(screen.getByLabelText('Path')).getByRole('button', { name: 'garden-plan' }));
    await waitForNames(ROOT_NAMES);
    fireEvent.click(within(screen.getByLabelText('Finder sidebar')).getByRole('button', { name: 'made-up-notes' }));
    await waitForNames(['made-up-list.md']);
    // Each person browses on their own: nothing about it is saved to the shared board.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test('an empty folder says so, and a folder that is gone says so in plain words, with Back still there', async () => {
    render(<Finder />);
    await waitForNames(ROOT_NAMES);
    fireEvent.doubleClick(row('made-up-empty'));
    await waitFor(() => expect(screen.getByTestId('finder-note')).toHaveTextContent(FINDER_WORDS.empty));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitForNames(ROOT_NAMES);
    gone.add(NOTES);
    fireEvent.doubleClick(row('made-up-notes'));
    await waitFor(() => expect(screen.getByTestId('finder-note')).toHaveTextContent('This folder is not there any more. It may have been moved or deleted.'));
    expect(screen.getByTestId('finder-note')).not.toHaveTextContent(/doesn't exist|made-up\/projects/);
    expect(screen.queryByRole('button', { name: FINDER_WORDS.openProject })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitForNames(ROOT_NAMES);
  });

  test('coming back to the window lists its folder again, so files changed meanwhile show', async () => {
    const { rerender } = render(<Finder isActive />);
    await waitForNames(ROOT_NAMES);
    rerender(<Finder isActive={false} />);
    tree[ROOT] = [...tree[ROOT].filter((item) => item.name !== 'made-up-tool.js'), file(ROOT, 'made-up-added.md', 7, 0)];
    rerender(<Finder isActive />);
    await waitForNames(['made-up-empty', 'made-up-notes', 'made-up-plan.md', 'made-up-added.md']);
  });

  test('an answer that comes back late never replaces the folder shown now', async () => {
    render(<Finder />);
    await waitForNames(ROOT_NAMES);
    const answer = global.fetch;
    const late = {};
    global.fetch = jest.fn((url, init) => (url.includes(encodeURIComponent(NOTES))
      ? new Promise((resolve) => { late.resolve = () => resolve(answer(url, init)); })
      : answer(url, init)));
    fireEvent.doubleClick(row('made-up-notes'));
    await waitFor(() => expect(late.resolve).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitForNames(ROOT_NAMES);
    await act(async () => {
      late.resolve();
      await new Promise((done) => setTimeout(done, 20));
    });
    expect(names()).toEqual(ROOT_NAMES);
  });

  test("a new Finder starts in the board's default project, and one following the default keeps it when the default changes", () => {
    useWorkspaceStore.setState({ currentProject: { type: 'local', name: 'garden-plan', path: ROOT } });
    try {
      const id = useWorkspaceStore.getState().spawnAt('finderFiles', {}, { x: 0, y: 0 });
      const made = useWorkspaceStore.getState().wins.find((w) => w.id === id);
      expect(made.project).toMatchObject({ name: 'garden-plan', path: ROOT });
      expect(isProjectAware(made)).toBe(true);
      // A Finder that never had a project (the Notes Workspace board's) is kept on the old default.
      const following = { id: 'made-up-finder', kind: 'finderFiles' };
      expect(pinWindowsToProject([following], PROJECT)[0].project).toMatchObject({ path: ROOT });
    } finally {
      useWorkspaceStore.setState({ currentProject: null });
    }
  });

  test("with no project it says so and offers to open one; the folder picked becomes this window's project", async () => {
    const onUpdate = jest.fn();
    render(<Finder currentProject={null} onUpdate={onUpdate} />);
    expect(screen.getByText(FINDER_WORDS.noProject)).toBeTruthy();
    expect(calls.some((c) => c.url.startsWith('/api/files/browse'))).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: FINDER_WORDS.openProject }));
    fireEvent.click(await screen.findByRole('option', { name: 'garden-plan' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mount to a folder' })).toHaveTextContent(ROOT));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mount here' })); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({
      project: { type: 'local', name: 'garden-plan', path: ROOT, projectId: 'made-up-id', chosen: true },
    }));
    expect(calls.some((c) => c.url === '/api/projects/open' && c.method === 'POST')).toBe(true);
  });

  test('a project no longer open on the board says so in its own words, and opening it again lists it at once', async () => {
    const owner = global.fetch;
    let reopened = false;
    global.fetch = jest.fn(async (url, init) => {
      if (url === '/api/projects/open') reopened = true;
      if (url.startsWith('/api/files/browse') && !reopened) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: `${ROOT} isn't in a project open on this board. Type it in the path bar and press Enter to open it.`, reason: 'outside' }),
        };
      }
      return owner(url, init);
    });
    const onUpdate = jest.fn();
    render(<Finder onUpdate={onUpdate} />);
    await waitFor(() => expect(screen.getByTestId('finder-note')).toHaveTextContent('This folder is not in a project open on this board.'));
    expect(screen.getByTestId('finder-note')).not.toHaveTextContent('path bar');
    // The owner opens the same folder again: same path, so only a fresh list shows it.
    fireEvent.click(await screen.findByRole('button', { name: FINDER_WORDS.openProject }));
    fireEvent.click(await screen.findByRole('option', { name: 'garden-plan' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mount to a folder' })).toHaveTextContent(ROOT));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mount here' })); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ project: expect.objectContaining({ path: ROOT }) })));
    await waitForNames(ROOT_NAMES);
  });

  test('Enter on a folder opens it and keeps the keyboard in the list: on its first row, or on Back when it is empty', async () => {
    render(<Finder />);
    await waitForNames(ROOT_NAMES);
    row('made-up-notes').focus();
    fireEvent.keyDown(row('made-up-notes'), { key: 'Enter' });
    await waitForNames(['made-up-list.md']);
    await waitFor(() => expect(document.activeElement).toBe(row('made-up-list.md')));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitForNames(ROOT_NAMES);
    row('made-up-empty').focus();
    fireEvent.keyDown(row('made-up-empty'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('finder-note')).toHaveTextContent(FINDER_WORDS.empty));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back' })));
  });

  test('in Docker on Linux, where folders come back in the server\'s own paths, the title, path bar and sidebar still follow them', async () => {
    const SHOWN = '/workspace/projects/garden-plan';
    const inside = `${SHOWN}/made-up-notes`;
    const answers = {
      [ROOT]: { path: SHOWN, children: [dir(SHOWN, 'made-up-notes', HOUR), file(SHOWN, 'made-up-plan.md', 52, HOUR)] },
      [inside]: { path: inside, children: [file(inside, 'made-up-list.md', 9, HOUR)] },
    };
    global.fetch = jest.fn(async (url) => {
      const folder = new URL(url, 'http://made-up.invalid').searchParams.get('path');
      if (answers[folder]) return { ok: true, status: 200, json: async () => answers[folder] };
      return { ok: false, status: 404, json: async () => ({ error: 'made-up', reason: 'missing' }) };
    });
    render(<Finder />);
    await waitForNames(['made-up-notes', 'made-up-plan.md']);
    fireEvent.doubleClick(row('made-up-notes'));
    await waitForNames(['made-up-list.md']);
    expect(toolbar()).toBe('made-up-notes');
    expect(screen.getByLabelText('Path')).toHaveTextContent('garden-plan›made-up-notes1 item');
    expect(within(screen.getByLabelText('Finder sidebar')).getByRole('button', { name: 'made-up-notes' })).toHaveAttribute('data-active', 'true');
    fireEvent.click(within(screen.getByLabelText('Path')).getByRole('button', { name: 'garden-plan' }));
    await waitForNames(['made-up-notes', 'made-up-plan.md']);
  });

  test("a teammate's Finder with no project says only the computer's owner opens one, and offers no picker", async () => {
    role = 'user';
    render(<Finder currentProject={null} />);
    expect(await screen.findByText(FINDER_WORDS.ownerOpens)).toBeTruthy();
    expect(screen.queryByRole('button', { name: FINDER_WORDS.openProject })).toBeNull();
    expect(calls.some((c) => c.url.startsWith('/api/files/folders'))).toBe(false);
  });
});

describe("the Finder's words", () => {
  test('sizes read the way Finder writes them', () => {
    expect([0, 1, 52, 999, 1000, 4321, 999_499, 999_600, 1_500_000, 12_345_678, 2_000_000_000].map(formatSize))
      .toEqual(['0 bytes', '1 byte', '52 bytes', '999 bytes', '1 KB', '4 KB', '999 KB', '1 MB', '1.5 MB', '12.3 MB', '2 GB']);
    expect(formatSize(undefined)).toBe('--');
  });

  test('dates say Today and Yesterday, and the date further back', () => {
    const now = new Date(2026, 9, 29, 9, 30);
    const at = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const earlier = new Date(2026, 9, 29, 0, 5);
    const lateYesterday = new Date(2026, 9, 28, 23, 59);
    expect(formatModified(earlier.getTime(), now)).toBe(`Today at ${at(earlier)}`);
    expect(formatModified(lateYesterday.getTime(), now)).toBe(`Yesterday at ${at(lateYesterday)}`);
    expect(formatModified(new Date(2026, 2, 14, 10, 3).getTime(), now)).toMatch(/2026 at /);
    expect(formatModified(undefined, now)).toBe('--');
  });

  test('the path bar runs from the project down, in the project path\'s own slashes', () => {
    expect(finderCrumbs('/a/garden', '/a/garden/notes/old', 'Garden')).toEqual([
      { name: 'Garden', path: '/a/garden' }, { name: 'notes', path: '/a/garden/notes' }, { name: 'old', path: '/a/garden/notes/old' },
    ]);
    expect(finderCrumbs('D:\\Projects\\garden', 'D:\\Projects\\garden\\notes')).toEqual([
      { name: 'garden', path: 'D:\\Projects\\garden' }, { name: 'notes', path: 'D:\\Projects\\garden\\notes' },
    ]);
    expect(finderCrumbs('/a/garden', '/a/garden-two', 'Garden')).toEqual([{ name: 'Garden', path: '/a/garden' }]);
    // In Docker on Linux the server answers in its own paths; the top stays the project's.
    expect(finderCrumbs('/home/pat/Projects/garden', '/workspace/projects/garden/notes', 'Garden', '/workspace/projects/garden')).toEqual([
      { name: 'Garden', path: '/home/pat/Projects/garden' }, { name: 'notes', path: '/workspace/projects/garden/notes' },
    ]);
  });

  test("a folder that cannot be listed never shows the error's own text", () => {
    expect(finderProblem({ status: 500, error: 'EACCES: permission denied, scandir /made-up' }).words).toBe('This folder could not be opened just now.');
    expect(finderProblem({ status: 403, reason: 'ownerOnly', error: "Only this computer's owner can open this folder." }).words)
      .toBe("Only this computer's owner can open this folder.");
    expect(finderProblem({ status: 404, reason: 'missing', error: 'made-up' }).words).toMatch(/^This folder is not there any more/);
    // A folder censaiOS in Docker cannot see keeps the server's words: they say how to share it.
    const unseen = "censaiOS can't see E:\\Made-up yet. It runs in Docker and only sees the folder it was started from and your projects folder.";
    expect(finderProblem({ status: 404, reason: 'unseen', error: unseen })).toEqual({ reason: 'unseen', words: unseen });
  });
});
