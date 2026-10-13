import {
  windowProject, resolveWindowProject, pinWindowsToProject, projectPatch, boardProjects, hasOwnProject,
} from '../src/lib/windowProject.js';

const ALPHA = { type: 'local', name: 'Alpha', path: 'D:\\work\\alpha', projectId: 'p-a', failures: [] };
const BETA = { type: 'local', name: 'Beta', path: 'D:\\work\\beta' };

describe('multi-project board: each window keeps its own project', () => {
  test('a window without a project follows the board default', () => {
    expect(windowProject({ kind: 'chat' }, ALPHA)).toBe(ALPHA);
  });

  test("a window's own project beats the board default", () => {
    expect(windowProject({ kind: 'chat', project: BETA }, ALPHA)).toBe(BETA);
  });

  test('folder windows resolve from their own folder', () => {
    expect(windowProject({ kind: 'files', dirPath: 'D:\\work\\beta' }, ALPHA).path).toBe('D:\\work\\beta');
    expect(windowProject({ kind: 'terminal', cwd: 'D:/work/alpha/src' }, ALPHA)).toBe(ALPHA);
    expect(windowProject({ kind: 'devServer', folder: 'D:\\work\\beta', project: BETA }, ALPHA)).toBe(BETA);
  });

  test('switching the default pins windows that were following the old one', () => {
    const wins = [
      { id: 'a', kind: 'chat' },
      { id: 'b', kind: 'terminal', cwd: 'D:\\work\\beta' },
      { id: 'c', kind: 'note' },
      { id: 'd', kind: 'todos', project: BETA },
    ];
    const pinned = pinWindowsToProject(wins, ALPHA);
    expect(pinned[0].project).toEqual({ type: 'local', name: 'Alpha', path: 'D:\\work\\alpha', projectId: 'p-a' });
    expect(pinned[1]).toBe(wins[1]);
    expect(pinned[2]).toBe(wins[2]);
    expect(pinned[3]).toBe(wins[3]);
    expect(pinWindowsToProject(wins, null)).toBe(wins);
    expect(hasOwnProject(pinned[0])).toBe(true);
  });

  test('picking a project moves just that window, folder fields included', () => {
    expect(projectPatch({ kind: 'files', mode: 'github' }, BETA)).toEqual({
      project: { type: 'local', name: 'Beta', path: 'D:\\work\\beta', chosen: true },
      dirPath: 'D:\\work\\beta', mode: 'local', githubRepo: null,
    });
    expect(projectPatch({ kind: 'terminal' }, BETA)).toMatchObject({ cwd: 'D:\\work\\beta', title: 'Terminal · Beta' });
    expect(projectPatch({ kind: 'agentConsole' }, BETA)).toMatchObject({ folder: 'D:\\work\\beta' });
    expect(projectPatch({ kind: 'chat' }, BETA)).toEqual({ project: { type: 'local', name: 'Beta', path: 'D:\\work\\beta', chosen: true } });
  });

  test('a chat in a canvas group follows the group file tree until a project is picked for it', () => {
    const group = { id: 'g1', x: 0, y: 0, w: 1000, h: 1000, label: 'Shop' };
    const files = { id: 'f', kind: 'files', dirPath: 'D:\\work\\beta', x: 10, y: 10, w: 100, h: 100 };
    const chat = { id: 'c', kind: 'chat', agentId: 'atlas', x: 200, y: 10, w: 100, h: 100, project: ALPHA };
    const ctx = { wins: [files, chat], canvasGroups: [group], boardDefault: ALPHA };
    expect(resolveWindowProject(chat, ctx)).toMatchObject({ path: 'D:\\work\\beta', scopeType: 'canvas_group', scopeId: 'g1' });
    const picked = { ...chat, ...projectPatch(chat, ALPHA) };
    expect(resolveWindowProject(picked, { ...ctx, wins: [files, picked] }).path).toBe('D:\\work\\alpha');
  });

  test('boardProjects lists each project once with its window count', () => {
    const list = boardProjects([
      { kind: 'files', dirPath: 'D:\\work\\beta' },
      { kind: 'chat', project: BETA },
      { kind: 'chat' },
    ], ALPHA);
    expect(list.map((p) => [p.name, p.windows])).toEqual([['Alpha', 1], ['beta', 2]]);
  });
});
