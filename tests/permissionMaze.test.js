import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// One rule book for "which project does this call mean, and may the agent work
// there". Four places used to answer that their own way:
//   - the test runner took any folder given by its path, with no check at all;
//   - off a board, a project name that matched nothing was quietly swapped for
//     another project, and "no name" meant whichever row was touched last;
//   - a squad's tasks carried no project, so helpers worked wherever they were
//     last bound;
//   - coding terminals only knew the folders picked in the top bar, not the
//     projects agents work in.
// Everything here is made up: Pat Example owns this computer, Sam Example is a
// teammate; the folders are throwaway.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const BOARD = 'made-up-board';

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-permission-maze-')));
const stateDir = path.join(tempRoot, 'state');
fs.mkdirSync(stateDir, { recursive: true });
process.env.CENSAI_STATE_DIR = stateDir;
const priorMode = process.env.CENSAI_MODE;

const folderOf = (name, pkg = true) => {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(path.join(dir, 'packages', 'inner'), { recursive: true });
  if (pkg) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, scripts: { test: 'true' } }));
    fs.writeFileSync(path.join(dir, 'packages', 'inner', 'package.json'), JSON.stringify({ name: `${name}-inner` }));
  }
  return dir;
};
const row = (id, name, dir, updated) => ({ id, name, path: dir, repo: null, owner_agent_id: 'shared', updated_at: updated });
const GARDEN = row('made-up-garden', 'Garden', folderOf('garden'), '2026-10-01T00:00:00Z');
const BAKERY = row('made-up-bakery', 'Bakery', folderOf('bakery'), '2026-10-30T00:00:00Z');
const LEDGER = row('made-up-ledger', 'Ledger', folderOf('ledger'), '2026-10-10T00:00:00Z');
const ELSEWHERE = row('made-up-elsewhere', 'Elsewhere', path.join(tempRoot, 'on-another-computer'), '2026-10-05T00:00:00Z');
const PROJECTS = [GARDEN, BAKERY, LEDGER, ELSEWHERE];
const stray = folderOf('not-a-project');

// What the made-up board gave each agent.
const GIVEN = { atlas: { [GARDEN.id]: 'work', [LEDGER.id]: 'read' } };
const SUBS = [{ id: 'sub-scout', name: 'Scout-1', parent_id: 'atlas', project_id: GARDEN.id, workspace_id: BOARD }];

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const quiet = { error() {}, warn() {}, info() {}, debug() {}, trace() {}, startTimer: () => () => 0 };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => quiet, redactUrl: (url) => url, writeLogRecord: () => {}, onLogRecord: () => () => {},
}));

const matches = (project, text) => {
  const wanted = String(text).toLowerCase();
  return project.id === text || project.name.toLowerCase() === wanted || project.path === text
    || path.basename(project.path).toLowerCase() === wanted;
};
const tasks = [];

beforeEach(() => {
  jest.clearAllMocks();
  tasks.length = 0;
  process.env.CENSAI_MODE = 'self_hosted';
  for (const file of fs.readdirSync(stateDir)) fs.rmSync(path.join(stateDir, file));
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('JOIN projects')) {
      const [board, agent, identifier] = params;
      const given = board === BOARD ? GIVEN[agent] || {} : {};
      const rows = PROJECTS.filter((p) => given[p.id] && (identifier == null || matches(p, identifier)))
        .map((p) => ({ ...p, workspace_permission: given[p.id] }));
      return { rows: rows.slice(0, 1) };
    }
    if (text.includes('FROM workspace_agent_projects')) {
      const permission = (GIVEN[params[2]] || GIVEN[params[1]] || {})[params.find((value) => PROJECTS.some((p) => p.id === value))];
      return { rows: permission ? [{ permission }] : [] };
    }
    if (text.includes('INSERT INTO agent_tasks')) {
      const task = { id: `task-${tasks.length + 1}-0000`, assignee_id: params[1], project_id: params[2], project: params[3], title: params[4] };
      tasks.push(task);
      return { rows: [task] };
    }
    if (text.includes('FROM sub_agents')) {
      return { rows: SUBS.filter((sub) => params.includes(sub.id) || params.includes(sub.parent_id)) };
    }
    if (text.includes('FROM projects')) {
      if (text.includes('WHERE id = $1')) return { rows: PROJECTS.filter((p) => p.id === params[0]) };
      if (text.includes('lower(name) = lower($2)')) return { rows: PROJECTS.filter((p) => p.name.toLowerCase() === String(params[1]).toLowerCase()) };
      if (text.includes('repo = $2')) return { rows: PROJECTS.filter((p) => p.path === params[1]) };
      if (text.includes('p.id = $1')) return { rows: PROJECTS.filter((p) => matches(p, params[0])).slice(0, 1) };
      // Lists: newest first, as the real queries sort them.
      return { rows: [...PROJECTS].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)) };
    }
    throw new Error(`Unexpected query: ${text}`);
  });
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  delete process.env.CENSAI_STATE_DIR;
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

const { resolveRunnerContext, PROJECT_ROOT } = await import('../server/tools/handlers/runnerUtils.js');
const { resolveProjectForCall } = await import('../server/tools/helpers.js');
const { handleDispatchTool } = await import('../server/tools/handlers/dispatch.js');
const { allowedRoots, assertAllowedFolder } = await import('../server/cli-agents/folders.js');
const { notEquippedWords } = await import('../server/approvals/requests.js');

const onBoard = (userId) => ({ workspaceId: BOARD, userId, requiredProjectPermission: 'work' });
const offBoard = (userId) => ({ userId, requiredProjectPermission: 'work' });

describe('the test runner, given a folder by its path', () => {
  test('a folder that is in no project is refused, though it has a package.json', async () => {
    await expect(resolveRunnerContext('atlas', { project_path: stray }, onBoard(PAT)))
      .rejects.toThrow('is not inside a project open on this computer');
    await expect(resolveRunnerContext('atlas', { project_path: stray }, offBoard(PAT)))
      .rejects.toThrow('is not inside a project open on this computer');
  });

  test("a project the board never gave the agent is refused for a teammate's chat, by path as by name", async () => {
    await expect(resolveRunnerContext('atlas', { project: 'Bakery' }, onBoard(SAM))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    await expect(resolveRunnerContext('atlas', { project_path: BAKERY.path }, onBoard(SAM))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    await expect(resolveRunnerContext('atlas', { project_path: path.join(BAKERY.path, 'packages', 'inner') }, onBoard(SAM)))
      .rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  });

  test('a project the board gave to read only stays read only, for the owner too', async () => {
    await expect(resolveRunnerContext('atlas', { project_path: LEDGER.path }, onBoard(PAT)))
      .rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED', readOnly: true });
  });

  test('a project the agent may work in runs in the folder that was named, a folder inside it included', async () => {
    expect((await resolveRunnerContext('atlas', { project_path: GARDEN.path }, onBoard(SAM))).cwd).toBe(GARDEN.path);
    const inner = path.join(GARDEN.path, 'packages', 'inner');
    expect((await resolveRunnerContext('atlas', { project_path: inner }, onBoard(SAM))).cwd).toBe(inner);
    // The owner's agents work in any project on this computer (ownerProjects.js).
    expect((await resolveRunnerContext('atlas', { project_path: BAKERY.path }, onBoard(PAT))).cwd).toBe(BAKERY.path);
  });

  test("this app's own folder, the default, still runs with no project named", async () => {
    expect((await resolveRunnerContext('atlas', {}, onBoard(PAT))).cwd).toBe(PROJECT_ROOT);
    expect((await resolveRunnerContext('atlas', { project_path: PROJECT_ROOT }, onBoard(PAT))).cwd).toBe(PROJECT_ROOT);
  });
});

describe('off a board, which project a call means', () => {
  test('a name that matches no project is refused, not swapped for another project', async () => {
    await expect(resolveProjectForCall('atlas', 'Orchard', offBoard(PAT)))
      .rejects.toThrow('No shared project matching "Orchard". Available projects: "Bakery"');
  });

  test('a name finds that project by its name, its id or its folder', async () => {
    for (const name of ['Garden', 'garden', GARDEN.id, GARDEN.path]) {
      expect((await resolveProjectForCall('atlas', name, offBoard(PAT))).project.id).toBe(GARDEN.id);
    }
  });

  test('no name means the project open on this computer, not the row touched last', async () => {
    fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'Garden', path: GARDEN.path, projectId: GARDEN.id }));
    expect((await resolveProjectForCall('atlas', null, offBoard(PAT))).project.id).toBe(GARDEN.id);
  });

  test('with nothing open, no name means the project worked in last', async () => {
    expect((await resolveProjectForCall('atlas', null, offBoard(PAT))).project.id).toBe(BAKERY.id);
  });
});

describe('a squad', () => {
  const squad = (args, userId = PAT) => handleDispatchTool('atlas', 'dispatch_squad', args, { workspaceId: BOARD, userId });
  const job = (extra = {}) => ({ assignee: 'Scout-1', title: 'Look into it', prompt: 'Read the notes and report.', ...extra });

  test("with no project named, each helper's task keeps the helper's own project", async () => {
    await squad({ tasks: [job()] });
    expect(tasks.map((task) => task.project_id)).toEqual([GARDEN.id]);
  });

  test("the squad's project goes onto every task, and one task can name its own", async () => {
    const said = await squad({ project: 'Bakery', tasks: [job(), job({ title: 'Check the books', project: 'Ledger' })] });
    expect(tasks.map((task) => [task.project_id, task.project])).toEqual([[BAKERY.id, 'Bakery'], [LEDGER.id, 'Ledger']]);
    expect(said).toContain('in "Bakery"');
    expect(said).toContain('2/2 tasks queued');
  });

  test('a project the board never gave the agent is not handed on from a teammate\'s chat', async () => {
    const said = await squad({ project: 'Bakery', tasks: [job()] }, SAM);
    expect(tasks).toEqual([]);
    expect(said).toContain('0/1 tasks queued');
    expect(said).toContain('not authorized for that project');
  });

  test('a project name that matches nothing fails that task and still queues the others', async () => {
    const said = await squad({ tasks: [job({ project: 'Orchard' }), job({ title: 'Second' })] });
    expect(tasks.map((task) => task.title)).toEqual(['Second']);
    expect(said).toContain('There is no project named "Orchard" on this computer.');
  });
});

describe('where a coding terminal may work', () => {
  test('every project censaiOS knows with a folder here, not only the folders picked in the top bar', async () => {
    const roots = (await allowedRoots()).map((root) => root.path);
    expect(roots).toEqual(expect.arrayContaining([GARDEN.path, BAKERY.path, LEDGER.path]));
    expect(await assertAllowedFolder(path.join(GARDEN.path, 'packages', 'inner'))).toBe(path.join(GARDEN.path, 'packages', 'inner'));
  });

  test('a project whose folder is not on this computer, and a folder in no project, are still refused', async () => {
    const roots = (await allowedRoots()).map((root) => root.path);
    expect(roots).not.toContain(ELSEWHERE.path);
    await expect(assertAllowedFolder(stray)).rejects.toThrow('Open that folder as a project first');
    await expect(assertAllowedFolder(tempRoot)).rejects.toThrow('Open that folder as a project first');
  });

  test('a folder picked in the top bar still counts, and comes first', async () => {
    fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([stray]));
    const roots = (await allowedRoots()).map((root) => root.path);
    expect(roots[0]).toBe(stray);
    expect(roots).toContain(GARDEN.path);
  });
});

test('a save refused for a missing module says which module, on which agent, and where to equip it', () => {
  expect(notEquippedWords('atlas', 'project_write')).toBe(
    'Atlas cannot use project_write on this board yet: Project Writer is not equipped on Atlas. '
    + "Tell the person in plain words: to let me do this here, open Atlas's Exo-Skeleton Builder, go to the Exo-Modules tab, and press Install and equip on Project Writer.",
  );
});
