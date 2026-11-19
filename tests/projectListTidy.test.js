import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isHelperFolder, projectFolderKey, readableProjectName, tidyProjectList,
} from '../shared/projects/projectList.js';

// The project menus (File menu "Default for new windows", Scheduler) listed
// every row of the projects table: the same folder twice, helper copies an
// agent opened (some-repo-worktrees/fix-x, .cache/agent-worktrees/ag-1),
// temp folders, and folders that were deleted, in no useful order.

jest.unstable_mockModule('../server/workspaces.js', () => ({ openProject: jest.fn(), listProjects: jest.fn(async () => []) }));
const { tidyProjectsForMenu, folderIsGone } = await import('../server/routes/projects/core.js');

const ROWS = [
  { id: 'shared-shop', name: 'Shop', path: 'D:\\Repos\\Shop', updatedAt: '2026-11-10T00:00:00Z' },
  { id: 'shared-shop-site', name: 'shop-site', path: 'd:/repos/shop/', updatedAt: '2026-11-12T00:00:00Z' },
  { id: 'shared-blog', name: 'Blog', path: 'D:\\Repos\\Blog', updatedAt: '2026-11-14T00:00:00Z' },
  { id: 'shared-fix-x', name: 'fix-x', path: '/home/alma/Shop-worktrees/fix-x', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-ag-1', name: 'ag-1', path: '/home/alma/.cache/agent-worktrees/ag-1', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-claude-wt', name: 'wt', path: 'D:\\Repos\\Shop\\.claude\\worktrees\\wt', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-tmp', name: 'open-by-path', path: '/tmp/open-by-path-Ab12/shop-site', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-win-tmp', name: 'try', path: 'C:\\Users\\alma\\AppData\\Local\\Temp\\try', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-scratch', name: 'notes', path: '/home/alma/scratchpad/notes', updatedAt: '2026-11-15T00:00:00Z' },
  { id: 'shared-idea', name: 'Idea-Foundry', path: null, repo: 'someone/Idea-Foundry', updatedAt: '2026-11-13T00:00:00Z' },
  { id: 'shared-idea-2', name: 'idea foundry', path: null, repo: 'Someone/idea-foundry', updatedAt: '2026-11-01T00:00:00Z' },
];

test('helper copies, temp and scratch folders are spotted; real projects are not', () => {
  for (const p of ROWS.slice(3, 9)) expect(isHelperFolder(p.path)).toBe(true);
  expect(isHelperFolder('D:\\Repos\\Shop')).toBe(false);
  expect(isHelperFolder('/home/alma/projects/templates')).toBe(false);
  expect(isHelperFolder('/home/alma/projects/temperature-log')).toBe(false);
  // Folders people named "temp" or "scratch" themselves are theirs.
  expect(isHelperFolder('/home/alma/tmp/shop')).toBe(false);
  expect(isHelperFolder('D:\\Temp\\ClientSite')).toBe(false);
  expect(isHelperFolder('/home/alma/scratch/blog')).toBe(false);
  expect(isHelperFolder('/var/tmp/try')).toBe(true);
  expect(projectFolderKey('D:\\Repos\\Shop\\')).toBe('d:/repos/shop');
});

test('each folder once, no helper folders, current first, then most recently used', () => {
  const list = tidyProjectList(ROWS, { projectId: 'shared-shop', path: 'D:\\Repos\\Shop' });
  expect(list.map(p => p.id)).toEqual(['shared-shop', 'shared-blog', 'shared-idea']);
  expect(list[0].isCurrent).toBe(true);
  expect(list.filter(p => p.isCurrent)).toHaveLength(1);
});

test('without a current project the newest row for a folder is kept', () => {
  const list = tidyProjectList(ROWS, null);
  expect(list.map(p => p.id)).toEqual(['shared-blog', 'shared-idea', 'shared-shop-site']);
});

test('the current project is found by its folder even under another id', () => {
  const list = tidyProjectList(ROWS, { projectId: 'shared-old-name', path: 'D:/Repos/Shop' });
  expect(list[0]).toMatchObject({ id: 'shared-shop-site', isCurrent: true });
});

test('a helper folder someone chose as the default stays, first', () => {
  const list = tidyProjectList(ROWS, { projectId: 'shared-fix-x', path: '/home/alma/Shop-worktrees/fix-x' });
  expect(list[0]).toMatchObject({ id: 'shared-fix-x', isCurrent: true });
  expect(list.some(p => p.id === 'shared-ag-1')).toBe(false);
});

test('a helper folder someone opened on the board stays', () => {
  const byOption = tidyProjectList(ROWS, null, { keepFolders: ['/home/alma/Shop-worktrees/fix-x/'] });
  expect(byOption.some(p => p.id === 'shared-fix-x')).toBe(true);
  const byFlag = tidyProjectList([{ id: 'w', name: 'w', path: '/home/alma/.cache/agent-worktrees/w', opened: true }]);
  expect(byFlag.map(p => p.id)).toEqual(['w']);
});

test('a helper folder row that has a GitHub repo stays as that repo', () => {
  const rows = [{ id: 'foo', name: 'foo', path: '/home/alma/Shop-worktrees/foo', repo: 'me/foo' }];
  expect(tidyProjectList(rows)).toEqual([expect.objectContaining({ id: 'foo', path: null, repo: 'me/foo' })]);
  expect(tidyProjectList(rows, null, { localOnly: true })).toEqual([]);
});

test('localOnly drops GitHub-only rows', () => {
  const list = tidyProjectList(ROWS, null, { localOnly: true });
  expect(list.every(p => p.path)).toBe(true);
});

test('names are readable, and two folders with one name say where each is', () => {
  expect(readableProjectName({ name: 'D:\\Repos\\Shop', path: 'D:\\Repos\\Shop' })).toBe('Shop');
  expect(readableProjectName({ name: '  ', path: '/home/alma/blog/' })).toBe('blog');
  expect(readableProjectName({ name: '', repo: 'someone/Idea-Foundry' })).toBe('Idea-Foundry');
  const list = tidyProjectList([
    { id: 'a', name: 'site', path: 'D:\\Work\\site' },
    { id: 'b', name: 'Site', path: 'D:\\Clients\\site' },
    { id: 'c', name: 'Blog', path: 'D:\\Work\\blog' },
  ]);
  expect(list.map(p => p.label).sort()).toEqual(['Blog', 'Site (in Clients)', 'site (in Work)']);
});

test('the server list drops folders that are gone and keeps GitHub rows', async () => {
  const rows = [
    { id: 'shared-shop', name: 'Shop', path: 'D:\\Repos\\Shop', updated_at: '2026-11-10T00:00:00Z' },
    { id: 'shared-old', name: 'Old', path: 'D:\\Repos\\Old', updated_at: '2026-11-14T00:00:00Z' },
    { id: 'shared-idea', name: 'Idea', path: null, repo: 'someone/idea', updated_at: '2026-11-13T00:00:00Z', owner_agent_id: 'architect' },
  ];
  const isGone = jest.fn(async (p) => p.includes('Old'));
  const list = await tidyProjectsForMenu(rows, { current: { path: 'D:/Repos/Shop' }, checkFolders: true, isGone });
  expect(list.map(p => p.id)).toEqual(['shared-shop', 'shared-idea']);
  expect(list[1]).toMatchObject({ repo: 'someone/idea', ownerAgentId: 'architect', updatedAt: '2026-11-13T00:00:00Z' });
  expect(isGone).toHaveBeenCalledTimes(2);
});

test('the server list keeps a folder opened on the board and the repo of a gone folder', async () => {
  const rows = [
    { id: 'wt', name: 'fix-x', path: '/home/alma/Shop-worktrees/fix-x', updated_at: '2026-11-15T00:00:00Z' },
    { id: 'foo', name: 'foo', path: 'D:\\Repos\\foo', repo: 'me/foo', updated_at: '2026-11-14T00:00:00Z' },
  ];
  const list = await tidyProjectsForMenu(rows, {
    openFolders: ['/home/alma/Shop-worktrees/fix-x'], checkFolders: true, isGone: async (p) => p.includes('foo'),
  });
  expect(list).toEqual([
    expect.objectContaining({ id: 'wt', opened: true }),
    expect.objectContaining({ id: 'foo', path: null, repo: 'me/foo' }),
  ]);
  expect(list[1].opened).toBeUndefined();
});

test('a folder is gone only when it is not there', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-gone-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'x');
  try {
    expect(await folderIsGone(dir)).toBe(false);
    expect(await folderIsGone(path.join(dir, 'missing'))).toBe(true);
    expect(await folderIsGone(file)).toBe(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
