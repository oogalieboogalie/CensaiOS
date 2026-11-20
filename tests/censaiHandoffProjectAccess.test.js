// Censai hands a job in its project to a family member: the family member
// works in that project's folder with Censai's own access to it on this
// board, for as long as the plan runs (server/censaiOrchestrator/projectShare.js).
//
// The board here gives the made-up project only to Censai, the way a board
// gives a project only to the agents whose windows are on it. The real
// folder lookups, project reads and test-script reads run against a made-up
// folder; only the database and the family member's model are stand-ins.
import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fakePlanDb } from './support/censaiPlanDb.js';

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-handoff-access-')));
const folder = path.join(tempRoot, 'MadeUpBase');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }));
fs.writeFileSync(path.join(folder, 'notes.md'), 'Made-up notes');

const PROJECT = { id: 'made-up-base', name: 'MadeUpBase', path: folder, repo: null };
const OTHER = { id: 'made-up-other', name: 'MadeUpOther', path: path.join(tempRoot, 'MadeUpOther'), repo: null };
const scope = { workspaceId: 'ws-1', userId: 7 };
// What the board's list gives is looked at from a teammate's chat: this computer's owner is not
// held to the list (server/workspaces/ownerProjects.js, tests/ownerAnyProject.test.js).
const teammate = { workspaceId: 'ws-1', userId: 8 };

let db = null;
// The tools read the database through server/db.js; this one answers from the stand-in board.
const pool = { query: (...args) => db.query(...args) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => null),
  getSubAgentById: jest.fn(async () => null),
}));

const { handleCensaiPlanTool } = await import('../server/tools/handlers/censaiOrchestrator.js');
const { planSettled, recoverOnce, resetPlansForTests } = await import('../server/censaiOrchestrator/runner.js');
const { sharePlanProject, shareProject, takeBackPlanProject } = await import('../server/censaiOrchestrator/projectShare.js');
const { resolveRunnerContext } = await import('../server/tools/handlers/runnerUtils.js');
const { resolveProjectForCall } = await import('../server/tools/helpers.js');
const { readTestScript, runProjectTests } = await import('../server/censaiOrchestrator/projectTests.js');
const { findProjectFile } = await import('../server/censaiOrchestrator/projectFiles.js');

// The projects a board gives its agents (workspace_agent_projects, server/workspaces/projectAccess.js),
// on top of the orchestrator's stand-in plan table.
// computer: the projects the owner's lookup finds on this computer (server/workspaces/ownerProjectLookup.js).
function withBoardProjects(planDb, { projects = [], memberships = [], computer = [] }) {
  const shares = memberships.map((row) => ({ source_kind: 'canvas', source_id: null, ...row }));
  const folderName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
  const byWork = (a, b) => (a.permission === 'work' ? 0 : 1) - (b.permission === 'work' ? 0 : 1);
  const planShare = (row) => row.source_kind === 'task' && String(row.source_id || '').startsWith('censai-plan:');
  async function query(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.includes('FROM workspace_agent_projects wap JOIN projects p ON p.id = wap.project_id WHERE wap.workspace_id = $1 AND wap.agent_id = $2')) {
      const [workspaceId, agentId, wanted] = params;
      const key = String(wanted || '').toLowerCase();
      // A lent project (source_kind 'task') only when the call names one, as the real query ranks it.
      const lentLast = (a, b) => (wanted ? 0 : (a.source_kind === 'task') - (b.source_kind === 'task'));
      const hits = shares.filter((row) => row.workspace_id === workspaceId && row.agent_id === agentId)
        .sort((a, b) => lentLast(a, b) || byWork(a, b))
        .map((row) => ({ row, project: projects.find((p) => p.id === row.project_id) }))
        .filter(({ project }) => project && (!wanted || project.id === wanted || project.name.toLowerCase() === key
          || project.path === wanted || folderName(project.path).toLowerCase() === key));
      return { rows: hits.slice(0, 1).map(({ row, project }) => ({ ...project, workspace_permission: row.permission })) };
    }
    if (text.startsWith('SELECT permission FROM workspace_agent_projects')) {
      const [workspaceId, projectId, agentId] = params;
      const rows = shares.filter((row) => row.workspace_id === workspaceId && row.project_id === projectId && row.agent_id === agentId);
      return { rows: rows.sort(byWork).slice(0, 1).map((row) => ({ permission: row.permission })) };
    }
    if (text.startsWith('INSERT INTO workspace_agent_projects') && text.includes("'task'")) {
      const [workspaceId, projectId, agentId, permission, sourceId] = params;
      const row = shares.find((r) => r.workspace_id === workspaceId && r.project_id === projectId && r.agent_id === agentId && r.source_kind === 'task');
      if (row) Object.assign(row, { permission, source_id: sourceId });
      else shares.push({ workspace_id: workspaceId, project_id: projectId, agent_id: agentId, permission, source_kind: 'task', source_id: sourceId });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('DELETE FROM workspace_agent_projects')) {
      const gone = text.includes('agent_id = ANY')
        ? (row) => planShare(row) && row.workspace_id === params[0] && row.project_id === params[1] && params[2].includes(row.agent_id)
        : planShare;
      const before = shares.length;
      for (let i = shares.length - 1; i >= 0; i -= 1) if (gone(shares[i])) shares.splice(i, 1);
      return { rows: [], rowCount: before - shares.length };
    }
    if (text.startsWith('SELECT p.* FROM projects p') && computer.length) {
      const [wanted] = params;
      const key = String(wanted).toLowerCase();
      const hit = computer.find((p) => p.id === wanted) || computer.find((p) => p.path === wanted || p.repo === wanted)
        || computer.find((p) => p.name.toLowerCase() === key || folderName(p.path).toLowerCase() === key
          || (!key.includes('/') && String(p.repo || '').toLowerCase().endsWith(`/${key}`)));
      return { rows: hit ? [hit] : [] };
    }
    // Account 8 is a teammate on the board (see `teammate` above).
    if (text.includes('FROM users') && params[0] === 8) return { rows: [{ role: 'user' }] };
    return planDb.query(sql, params);
  }
  return { ...planDb, query, shares };
}

function board(censaiPermission = 'work') {
  return withBoardProjects(fakePlanDb(), {
    projects: [PROJECT, OTHER],
    memberships: [
      { workspace_id: 'ws-1', project_id: PROJECT.id, agent_id: 'censai', permission: censaiPermission },
      // A project the board gives Censai on another board only.
      { workspace_id: 'ws-2', project_id: OTHER.id, agent_id: 'censai', permission: 'work' },
    ],
  });
}

const codePlan = {
  goal: 'Add a line to the notes',
  project: 'MadeUpBase',
  jobs: [{ agent: 'atlas', job: 'Add a line to notes.md.', checklist: ['notes.md has the new line'], kind: 'code' }],
};

/** What Atlas can reach while it works: its folder for runs, and whether it may change files. */
async function whatAtlasReaches() {
  const seen = {};
  seen.cwd = (await resolveRunnerContext('atlas', { project: 'MadeUpBase' }, teammate)).cwd;
  seen.read = await resolveProjectForCall('atlas', 'MadeUpBase', { ...teammate, requiredProjectPermission: 'read' })
    .then(({ project }) => project.path, (error) => error.code);
  seen.work = await resolveProjectForCall('atlas', 'MadeUpBase', { ...teammate, requiredProjectPermission: 'work' })
    .then(({ project }) => project.path, (error) => error.code);
  seen.other = await resolveProjectForCall('atlas', 'MadeUpOther', { ...teammate, requiredProjectPermission: 'read' })
    .then(({ project }) => project.path, (error) => error.code);
  return seen;
}

function deps({ during = [] } = {}) {
  const ran = [];
  return {
    ran,
    deps: {
      db,
      now: () => Date.now(),
      runAgent: jest.fn(async () => {
        during.push(await whatAtlasReaches());
        return { finalText: 'Added the line to notes.md.', toolActions: [] };
      }),
      sendMail: jest.fn(async () => 1),
      markRead: jest.fn(async () => true),
      // The real lookups, as Atlas: the test script and the file in Atlas's folder for the project.
      readTestScript: (input) => readTestScript(input),
      findFile: (input) => findProjectFile({
        ...input,
        readFile: async (agentId, _tool, args, context) => {
          const { cwd } = await resolveRunnerContext(agentId, { project: args.project }, context);
          return fs.readFileSync(path.join(cwd, args.path), 'utf8');
        },
      }),
      // The real test run, in the folder Atlas's project resolves to; npm itself is a stand-in.
      runTests: (input) => runProjectTests({
        ...input,
        db,
        run: async (command, args, options) => {
          ran.push({ command, args, cwd: options.cwd });
          return { code: 0, stdout: 'Tests: 3 passed, 3 total', stderr: '' };
        },
      }),
      censaiModel: jest.fn(async () => ({ model: 'stand-in' })),
      askCensai: jest.fn(async (_model, messages) => (/what got done/.test(messages[0].content) ? 'Atlas added the line.' : '1 PASS The line is there.')),
    },
  };
}

const handOff = (plan, extra) => handleCensaiPlanTool('censai', 'hand_off_jobs', plan, scope, db, extra);

afterEach(() => resetPlansForTests());
afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

describe('a job Censai hands off in its project', () => {
  test('before the hand-off, Atlas has no way into the project on this board', async () => {
    db = board();
    await expect(resolveRunnerContext('atlas', { project: 'MadeUpBase' }, teammate)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    // Censai itself works there.
    expect((await resolveRunnerContext('censai', { project: 'MadeUpBase' }, scope)).cwd).toBe(folder);
  });

  test('is taken, and Atlas works in the project folder with Censai\'s access, then loses it when the plan ends', async () => {
    db = board();
    const during = [];
    const { deps: runDeps, ran } = deps({ during });
    const said = await handOff(codePlan, runDeps);
    expect(said).toContain('Handed off; it has only started.');
    const [id] = [...db.plans.keys()];
    await planSettled(id);

    expect(db.row(id).status).toBe('done');
    // While it worked: the project's own folder, allowed to change files, and nothing Censai lacks here.
    expect(during).toEqual([{ cwd: folder, read: folder, work: folder, other: 'PROJECT_ACCESS_DENIED' }]);
    // The tests ran in the project's folder.
    expect(ran.map((run) => run.cwd)).toEqual([folder]);
    expect(db.row(id).jobs[0].checklist.map((item) => item.state)).toEqual(['ticked', 'ticked']);
    // Once the plan is over, the board is as it was.
    expect(db.shares.filter((row) => row.agent_id === 'atlas')).toEqual([]);
    await expect(resolveRunnerContext('atlas', { project: 'MadeUpBase' }, teammate)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  });

  test('Atlas never gets more than Censai has: read-only for Censai is read-only for Atlas', async () => {
    db = board('read');
    const during = [];
    const lookIntoIt = {
      goal: 'Say what the notes hold', project: 'MadeUpBase',
      jobs: [{ agent: 'atlas', job: 'Read notes.md and say what it holds.', checklist: ['The notes are summed up'] }],
    };
    await handOff(lookIntoIt, deps({ during }).deps);
    const [id] = [...db.plans.keys()];
    await planSettled(id);
    expect(during).toEqual([{ cwd: folder, read: folder, work: 'PROJECT_ACCESS_DENIED', other: 'PROJECT_ACCESS_DENIED' }]);
    expect(db.shares.filter((row) => row.agent_id === 'atlas')).toEqual([]);
  });

  test('a project Censai cannot reach on this board is never shared', async () => {
    db = board();
    const elsewhere = { ...codePlan, project: 'MadeUpOther' };
    expect(await handOff(elsewhere, deps().deps)).toBe(
      'Error: I could not find the project "MadeUpOther" to run its tests. Job 1 needs the project\'s tests, so it could never be checked off. '
      + 'Hand out jobs that look into it and write up what to change instead, and tell the person why.',
    );
    expect(db.plans.size).toBe(0);
    expect(db.shares.filter((row) => row.agent_id === 'atlas')).toEqual([]);
  });
});

describe('taking the access back', () => {
  test('two plans give Atlas the project: the first to end leaves it for the one still running', async () => {
    db = board();
    const plan = (id) => ({ id, workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', jobs: [{ agentId: 'atlas' }] });
    const first = await shareProject(db, { planId: 'p1', workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', agentIds: ['atlas'] });
    const second = await shareProject(db, { planId: 'p2', workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', agentIds: ['atlas', 'nexus'] });
    await takeBackPlanProject(db, plan('p1'), first, [second]);
    expect(db.shares.filter((row) => row.source_kind === 'task').map((row) => row.agent_id).sort()).toEqual(['atlas', 'nexus']);
    await takeBackPlanProject(db, plan('p2'), second, []);
    expect(db.shares.filter((row) => row.source_kind === 'task')).toEqual([]);
    // What the board itself gave is never touched.
    expect(db.shares.filter((row) => row.agent_id === 'censai')).toHaveLength(2);
  });

  test('after a restart, what a stopped server never took back is taken back', async () => {
    db = board();
    await shareProject(db, { planId: 'cut-off', workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', agentIds: ['atlas'] });
    expect(db.shares.filter((row) => row.agent_id === 'atlas')).toHaveLength(1);
    await recoverOnce({ db });
    expect(db.shares.filter((row) => row.agent_id === 'atlas')).toEqual([]);
    expect(db.shares.filter((row) => row.agent_id === 'censai')).toHaveLength(2);
  });
});

// Diagram 11's next wall, found by running the whole path with a scripted model: the board gave
// Atlas a project of its own, the job was in Censai's, and Atlas named no project in its calls
// (its file tools say the name is optional). Its save landed in its own project and its run_tests
// ran this app's own tests, so Censai found the plan's project unchanged and the plan stopped, stuck.
describe('a call that names no project, while Atlas works a job', () => {
  /** Where Atlas's file tools and its test runs land when the call names no project. */
  async function unnamedCalls() {
    const save = await resolveProjectForCall('atlas', null, { ...teammate, requiredProjectPermission: 'work' });
    return { savesIn: save.project.id, testsRunIn: (await resolveRunnerContext('atlas', {}, teammate)).cwd };
  }

  test('means the job\'s project for its saves and its test runs, and its own project again once the job is over', async () => {
    db = board();
    // Atlas has a window of its own on this board, set to another project.
    const own = { workspace_id: 'ws-1', project_id: OTHER.id, permission: 'work', source_kind: 'canvas', source_id: null };
    db.shares.push({ ...own, agent_id: 'atlas' }, { ...own, agent_id: 'genesis' });
    const before = await unnamedCalls();
    expect(before).toEqual({ savesIn: OTHER.id, testsRunIn: process.cwd() });

    const during = [];
    const helper = [];
    const { deps: runDeps } = deps();
    runDeps.runAgent = jest.fn(async () => {
      during.push(await unnamedCalls());
      // An agent Atlas asks for help mid-job keeps its own project: only Atlas is on the job.
      helper.push((await resolveProjectForCall('genesis', null, { ...teammate, requiredProjectPermission: 'work' })).project.id);
      return { finalText: 'Added the line to notes.md.', toolActions: [] };
    });
    await handOff(codePlan, runDeps);
    const [id] = [...db.plans.keys()];
    await planSettled(id);

    expect(db.row(id).status).toBe('done');
    expect(during).toEqual([{ savesIn: PROJECT.id, testsRunIn: folder }]);
    expect(helper).toEqual([OTHER.id]);
    expect(await unnamedCalls()).toEqual(before);
  });

  test('a job in no project changes nothing: the call lands where it always did', async () => {
    const { runInJobProject, jobProjectFor } = await import('../server/tools/jobProject.js');
    expect(await runInJobProject({ agentId: 'atlas', project: null }, async () => jobProjectFor('atlas'))).toBeNull();
    expect(await runInJobProject({ agentId: 'Atlas', project: ' made-up-base ' }, async () => [jobProjectFor('atlas'), jobProjectFor('genesis')]))
      .toEqual(['made-up-base', null]);
    expect(jobProjectFor('atlas')).toBeNull();
  });
});

describe('what the loan does not change', () => {
  test('a call that names no project still lands in Atlas\'s own project while it has Censai\'s on loan', async () => {
    db = board();
    db.shares.push({ workspace_id: 'ws-1', project_id: OTHER.id, agent_id: 'atlas', permission: 'work', source_kind: 'canvas', source_id: null });
    await shareProject(db, { planId: 'p1', workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', agentIds: ['atlas'] });
    const unnamed = await resolveProjectForCall('atlas', null, { ...scope, requiredProjectPermission: 'work' });
    expect(unnamed.project.id).toBe(OTHER.id);
    const named = await resolveProjectForCall('atlas', 'MadeUpBase', { ...scope, requiredProjectPermission: 'work' });
    expect(named.project.id).toBe(PROJECT.id);
  });

  test('a share that fails halfway is still taken back', async () => {
    db = board();
    const failing = {
      ...db,
      query: async (sql, params) => {
        if (sql.includes('INSERT INTO workspace_agent_projects') && params[2] === 'nexus') throw Object.assign(new Error('made-up failure'), { code: '23503' });
        return db.query(sql, params);
      },
    };
    const plan = { id: 'p1', workspaceId: 'ws-1', userId: 7, project: 'MadeUpBase', jobs: [{ agentId: 'atlas' }, { agentId: 'nexus' }] };
    const shared = await sharePlanProject(failing, plan);
    expect(shared).toMatchObject({ projectId: PROJECT.id, agentIds: ['atlas'] });
    await takeBackPlanProject(failing, plan, shared, []);
    expect(db.shares.filter((row) => row.source_kind === 'task')).toEqual([]);
  });
});

// The board as it is on this computer: Censai's window is on a project with a
// folder here; the same folder is also listed as "Homebase", kept on GitHub
// (its saves go to GitHub), and Censai was never given that row on the board.
describe('a code job on Homebase, which the board knows by another name', () => {
  const HOMEBASE = { id: 'atlas-homebase', name: 'Homebase', path: folder, repo: 'made-up/Homebase' };
  const ON_GITHUB_ONLY = { id: 'atlas-on-github', name: 'OnGitHubOnly', path: '', repo: 'made-up/OnGitHubOnly' };

  function homeBoard(planDb = fakePlanDb()) {
    return withBoardProjects(planDb, {
      projects: [PROJECT, HOMEBASE, ON_GITHUB_ONLY],
      memberships: [{ workspace_id: 'ws-1', project_id: PROJECT.id, agent_id: 'censai', permission: 'work' }],
      computer: [PROJECT, HOMEBASE, ON_GITHUB_ONLY],
    });
  }

  async function runs(plan) {
    const during = [];
    const { deps: runDeps, ran } = deps({ during });
    const said = await handOff(plan, runDeps);
    const [id] = [...db.plans.keys()];
    if (id) await planSettled(id);
    return { said, row: id ? db.row(id) : null, during, ran };
  }

  test('named "Homebase", it is handed off in Censai\'s project in that folder, and its tests run there', async () => {
    db = homeBoard();
    const { said, row, during, ran } = await runs({ ...codePlan, project: 'Homebase' });
    expect(said).toContain('Handed off; it has only started.');
    // The plan works in the board's project for that folder, not the GitHub row.
    expect(row.project).toBe(PROJECT.id);
    expect(row.status).toBe('done');
    expect(during[0]).toMatchObject({ cwd: folder, work: folder });
    expect(ran.map((run) => run.cwd)).toEqual([folder]);
    expect(db.shares.filter((share) => share.agent_id === 'atlas')).toEqual([]);
  });

  test('with no project named, it is handed off in Censai\'s own project on this board', async () => {
    db = homeBoard();
    const { said, row, ran } = await runs({ ...codePlan, project: undefined });
    expect(said).toContain('Handed off; it has only started.');
    expect(row.project).toBe(PROJECT.id);
    expect(row.status).toBe('done');
    expect(ran.map((run) => run.cwd)).toEqual([folder]);
  });

  test('a project kept only on GitHub is still refused: this computer\'s tests cannot see its saves', async () => {
    db = homeBoard();
    const { said, row } = await runs({ ...codePlan, project: 'OnGitHubOnly' });
    expect(said).toMatch(/^Error: The project "atlas-on-github" lives on GitHub, so I can't run its tests on this computer\./);
    expect(row).toBeNull();
  });

  test('a teammate who names "Homebase" gets no owner lookup and no share', async () => {
    db = homeBoard(fakePlanDb({ members: { 'ws-1': { 7: 'owner', 8: 'member' } } }));
    const lookIntoIt = {
      goal: 'Say what the notes hold', project: 'Homebase',
      jobs: [{ agent: 'atlas', job: 'Read notes.md and say what it holds.', checklist: ['The notes are summed up'] }],
    };
    const shared = [];
    const { deps: runDeps } = deps();
    runDeps.runAgent = jest.fn(async () => {
      shared.push(...db.shares.filter((share) => share.agent_id === 'atlas'));
      return { finalText: 'The notes say hello.', toolActions: [] };
    });
    const said = await handleCensaiPlanTool('censai', 'hand_off_jobs', lookIntoIt, teammate, db, runDeps);
    expect(said).toContain('Handed off; it has only started.');
    const [id] = [...db.plans.keys()];
    await planSettled(id);
    // Kept as named: the folder match is only for what the owner's lookup finds.
    expect(db.row(id).project).toBe('Homebase');
    expect(shared).toEqual([]);
  });
});

// The board as it is on the owner's computer (diagram of 2026-11-19): Censai's
// window is on a project with a folder here, and the board also gives Censai
// "Homebase", a row kept only on GitHub. The folder is a checkout of that repo.
describe('a code job on a GitHub row whose code is checked out in Censai\'s own folder', () => {
  const ON_GITHUB = { id: 'shared-made-up', name: 'Homebase', path: '', repo: 'made-up/Homebase' };
  const gitConfig = path.join(folder, '.git', 'config');

  function remote(url) {
    fs.mkdirSync(path.dirname(gitConfig), { recursive: true });
    fs.writeFileSync(gitConfig, `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
  }

  function githubBoard({ onBoard = true } = {}) {
    return withBoardProjects(fakePlanDb(), {
      projects: [PROJECT, ON_GITHUB],
      // The first is the project Censai's window is set to: a call that names none lands there.
      memberships: [
        { workspace_id: 'ws-1', project_id: PROJECT.id, agent_id: 'censai', permission: 'work' },
        ...(onBoard ? [{ workspace_id: 'ws-1', project_id: ON_GITHUB.id, agent_id: 'censai', permission: 'work' }] : []),
      ],
      computer: [PROJECT, ON_GITHUB],
    });
  }

  async function runs(plan) {
    const during = [];
    const { deps: runDeps, ran } = deps({ during });
    const said = await handOff(plan, runDeps);
    const [id] = [...db.plans.keys()];
    if (id) await planSettled(id);
    return { said, row: id ? db.row(id) : null, during, ran };
  }

  afterEach(() => fs.rmSync(path.join(folder, '.git'), { recursive: true, force: true }));

  test('named "Homebase", it runs in Censai\'s own folder, and the tests run there', async () => {
    remote('git@github.com:made-up/Homebase.git');
    db = githubBoard();
    const { said, row, during, ran } = await runs({ ...codePlan, project: 'Homebase' });
    expect(said).toContain('Handed off; it has only started.');
    expect(row.project).toBe(PROJECT.id);
    expect(row.status).toBe('done');
    expect(during[0]).toMatchObject({ cwd: folder, work: folder });
    expect(ran.map((run) => run.cwd)).toEqual([folder]);
  });

  test('the same when the GitHub row is only found by the owner\'s lookup, with an https remote', async () => {
    remote('https://github.com/Made-Up/homebase');
    db = githubBoard({ onBoard: false });
    const { row } = await runs({ ...codePlan, project: 'Homebase' });
    expect(row.project).toBe(PROJECT.id);
    expect(row.status).toBe('done');
  });

  test('a folder that is a checkout of another repo is not swapped in, nor offered for a retry', async () => {
    remote('git@github.com:made-up/SomethingElse.git');
    db = githubBoard();
    const { said, row } = await runs({ ...codePlan, project: 'Homebase' });
    expect(row).toBeNull();
    expect(said).toBe('Error: The project "shared-made-up" lives on GitHub, so I can\'t run its tests on this computer. '
      + 'Job 1 needs the project\'s tests, so it could never be checked off. '
      + 'Hand out jobs that look into it and write up what to change instead, and tell the person why.');
  });

  test('a folder with no git settings is not swapped in, but is named for a retry if it is the same code', async () => {
    db = githubBoard();
    const { said, row } = await runs({ ...codePlan, project: 'Homebase' });
    expect(row).toBeNull();
    expect(said).toContain('Your own project on this board, "MadeUpBase", has its folder on this computer: if it is the same code, '
      + 'hand off again with project "MadeUpBase". If not, hand out jobs that look into it');
  });

  test('a job that needs no tests here keeps the GitHub row, so its GitHub tools still work there', async () => {
    remote('git@github.com:made-up/Homebase.git');
    db = githubBoard();
    const lookIntoIt = {
      goal: 'Say what the open pull requests are', project: 'Homebase',
      jobs: [{ agent: 'atlas', job: 'List the open pull requests on Homebase.', checklist: ['The open pull requests are listed'] }],
    };
    const { said, row } = await runs(lookIntoIt);
    expect(said).toContain('Handed off; it has only started.');
    expect(row.project).toBe(ON_GITHUB.id);
  });
});
