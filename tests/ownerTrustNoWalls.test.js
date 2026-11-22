import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Trust mode on the owner's own computer: no walls for the owner's agents
// (server/workspaces/ownerTrust.js). The board as on the owner's install
// (diagram 12): the project the agents are given is "Homebase", kept on GitHub;
// the same code is checked out here in a folder registered as "MadeUpHub".
// Before, every file tool on Homebase said it was GitHub-backed and the local
// file tools refused anything outside the agent's own folder.
const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-no-walls-')));
const HUB = path.join(tempRoot, 'MadeUpHub');
const ELSEWHERE = path.join(tempRoot, 'MadeUpElsewhere');
fs.mkdirSync(path.join(HUB, '.git'), { recursive: true });
fs.writeFileSync(path.join(HUB, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:made-up/homebase.git\n');
fs.mkdirSync(ELSEWHERE);
fs.writeFileSync(path.join(ELSEWHERE, 'notes.txt'), 'outside the project');
afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

const BOARD = 'made-up-board';
const [PAT, SAM] = [1, 2];
const ROLES = { [PAT]: 'admin', [SAM]: 'user' };
const ON_GITHUB = { id: 'shared-made-up', name: 'Homebase', path: '', repo: 'made-up/homebase' };
const HUB_ROW = { id: 'made-up-hub', name: 'MadeUpHub', path: HUB, repo: null };
let trusted = true;
let agentTrust = {};

const query = jest.fn(async (sql, params = []) => {
  const text = String(sql).replace(/\s+/g, ' ');
  if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
  if (text.includes('FROM workspace_agent_trust')) {
    return { rows: [{ agent_id: '*', trusted }, ...Object.entries(agentTrust).map(([agent_id, on]) => ({ agent_id, trusted: on }))] };
  }
  // The board gave every agent Homebase (the GitHub row) to work in.
  if (text.includes('SELECT p.*, wap.permission')) {
    const asked = params[2];
    return { rows: !asked || [ON_GITHUB.id, ON_GITHUB.name].includes(asked) ? [{ ...ON_GITHUB, workspace_permission: 'work' }] : [] };
  }
  if (text.includes('SELECT permission FROM workspace_agent_projects')) return { rows: [{ permission: 'work' }] };
  if (text.includes("WHERE (repo IS NULL OR repo = '')")) return { rows: [HUB_ROW] };
  if (text === 'SELECT * FROM projects WHERE id = $1') return { rows: params[0] === HUB_ROW.id ? [HUB_ROW] : [] };
  return { rows: [] };
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query }, query }));
const getSubAgentById = jest.fn(async () => null);
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById,
  // Genesis is bound to its own folder, so its local file tools stop at that folder.
  getAgent: jest.fn(async () => ({ id: 'genesis', project_id: 'made-up-hub', tool_scopes: null })),
}));
jest.unstable_mockModule('../server/runner/client.js', () => ({
  runnerClient: {
    fsList: async (dir) => fs.readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, isDirectory: d.isDirectory() })),
    fsRead: async (file) => fs.readFileSync(file, 'utf8'),
    fsWrite: async (file, content) => fs.writeFileSync(file, content),
  },
}));

const { resolveProjectForCall, resolveLocalProjectRoot } = await import('../server/tools/helpers.js');
const { handleLocalTool } = await import('../server/tools/handlers/local.js');
const { whyNoTestsHere, runProjectTests } = await import('../server/censaiOrchestrator/projectTests.js');
const { localCheckout, ownerUnfenced, runFenced } = await import('../server/workspaces/ownerTrust.js');
const { runsHere } = await import('../server/runner/hereForRun.js');

const owner = { workspaceId: BOARD, userId: PAT };
const teammate = { workspaceId: BOARD, userId: SAM };

afterEach(() => { trusted = true; agentTrust = {}; getSubAgentById.mockImplementation(async () => null); });

describe('a project kept on GitHub that is checked out here', () => {
  test('with Trust mode on, the owner\'s agent works in the folder here', async () => {
    const { project } = await resolveProjectForCall('genesis', 'Homebase', owner);
    expect(project).toMatchObject({ path: HUB, repo: null, github_repo: 'made-up/homebase' });
    expect(await resolveLocalProjectRoot('genesis', 'Homebase', owner)).toBe(HUB);
  });

  test('with Trust mode off it stays the GitHub project, and runs are refused as before', async () => {
    trusted = false;
    const { project } = await resolveProjectForCall('genesis', 'Homebase', owner);
    expect(project.repo).toBe('made-up/homebase');
    await expect(resolveLocalProjectRoot('genesis', 'Homebase', owner)).rejects.toThrow('GitHub-backed');
  });

  test('a teammate\'s chat keeps the GitHub project, whatever the switch says', async () => {
    const { project } = await resolveProjectForCall('genesis', 'Homebase', teammate);
    expect(project.repo).toBe('made-up/homebase');
  });

  test('tools whose job is GitHub keep the GitHub project', async () => {
    const { project } = await resolveProjectForCall('genesis', 'Homebase', owner, { github: true });
    expect(project.repo).toBe('made-up/homebase');
  });
});

describe('the refusal that stopped hand-offs: "lives on GitHub, so I can\'t run its tests"', () => {
  const why = (context) => whyNoTestsHere({ agentId: 'censai', project: 'Homebase', context });

  test('with Trust mode on, the owner\'s hand-off on Homebase is not refused: its tests run in the folder here', async () => {
    expect(await why(owner)).toBeNull();
  });

  test('with Trust mode off it is refused, as before', async () => {
    trusted = false;
    expect(await why(owner)).toMatch(/lives on GitHub, so I can't run its tests on this computer/);
  });
});

describe('the local file tools', () => {
  const list = (context) => handleLocalTool('genesis', 'local_list_dir', { dir_path: ELSEWHERE }, context);
  const write = (context) => handleLocalTool('genesis', 'local_write_file', { file_path: path.join(ELSEWHERE, 'new.txt'), content: 'hi' }, context);

  beforeEach(() => {
    fs.rmSync(path.join(ELSEWHERE, 'new.txt'), { force: true });
  });

  test('with Trust mode on, the owner\'s agent looks and writes outside its own folder', async () => {
    expect(await list(owner)).toContain('notes.txt');
    expect(await write(owner)).toContain('Successfully wrote');
    expect(fs.readFileSync(path.join(ELSEWHERE, 'new.txt'), 'utf8')).toBe('hi');
  });

  test('a helper of an agent whose own Trust mode is off stays inside its folder too', async () => {
    agentTrust = { atlas: false };
    getSubAgentById.mockImplementation(async () => ({ id: 'helper-1', parent_id: 'atlas', project_id: HUB_ROW.id, tool_scopes: null }));
    expect(await list(owner)).toContain('Access restricted');
    agentTrust = {};
    expect(await list(owner)).toContain('notes.txt');
  });

  test('with Trust mode off, or in a teammate\'s chat, it stays inside its own folder', async () => {
    trusted = false;
    expect(await list(owner)).toContain('Access restricted');
    trusted = true;
    expect(await list(teammate)).toContain('Access restricted');
    expect(await write(teammate)).toContain('Access restricted');
    expect(fs.existsSync(path.join(ELSEWHERE, 'new.txt'))).toBe(false);
  });
});

describe('the checklist\'s own test run', () => {
  // It runs after the agent's turn, outside any tool call, so it carries the decision itself.
  async function whereItRan(context) {
    let here = null;
    const result = await runProjectTests({
      agentId: 'genesis', project: 'Homebase', context,
      readPkg: async () => ({ scripts: { test: 'jest' } }),
      run: async () => { here = await runsHere(); return { code: 0, stdout: 'ok', stderr: '' }; },
    });
    return { here, result };
  }

  test('for the owner with Trust mode on, the tests run here, not on a Docker-only runner', async () => {
    expect((await whereItRan(owner)).here).toBe(true);
  });

  test('with Trust mode off they never reach the folder: the GitHub project is refused, as before', async () => {
    trusted = false;
    const { here, result } = await whereItRan(owner);
    expect(here).toBeNull();
    expect(JSON.stringify(result)).toMatch(/GitHub/);
  });
});

describe('a run a board trigger set off', () => {
  test('keeps every fence, even under the owner\'s name', async () => {
    expect(await ownerUnfenced(owner, 'genesis')).toBe(true);
    expect(await runFenced(() => ownerUnfenced(owner, 'genesis'))).toBe(false);
  });
});

describe('picking the folder for a GitHub project', () => {
  const repos = (map) => async (folder) => new Set(map[folder] || []);
  const rowsDb = (rows) => ({ query: async (sql) => (String(sql).includes("repo IS NULL OR repo = ''") ? { rows } : { rows: [] }) });
  const A = { id: 'made-up-a', name: 'A', path: '/made-up/a', repo: null };
  const B = { id: 'made-up-b', name: 'B', path: '/made-up/b', repo: null };

  test('one folder whose origin is the repo: that one', async () => {
    const found = await localCheckout(ON_GITHUB, { db: rowsDb([A, B]), folderRepos: repos({ '/made-up/b': ['made-up/homebase'] }) });
    expect(found).toMatchObject({ id: 'made-up-b', github_repo: 'made-up/homebase' });
  });

  test('two folders of the same repo and neither on the board: keep GitHub rather than guess', async () => {
    const both = { '/made-up/a': ['made-up/homebase'], '/made-up/b': ['made-up/homebase'] };
    expect(await localCheckout(ON_GITHUB, { db: rowsDb([A, B]), folderRepos: repos(both) })).toBeNull();
  });

  test('the family\'s past is never picked, so it stays read only', async () => {
    const past = { id: 'shared-family-past', name: 'Family past', path: '/made-up/past', repo: null };
    const found = await localCheckout(ON_GITHUB, { db: rowsDb([past]), folderRepos: repos({ '/made-up/past': ['made-up/homebase'] }) });
    expect(found).toBeNull();
  });
});
