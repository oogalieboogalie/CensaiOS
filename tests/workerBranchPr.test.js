import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every coding worker gets its own branch on GitHub before it changes
// anything, and a way to open the pull request from it. The real project
// tools run here; GitHub is made up at the fetch level and the database is a
// small made-up one. Alma's board hands coding jobs to the family agent atlas
// and to worker sub-agents, in the made-up repo acme/shop whose main branch
// is "master".
const REPO = 'acme/shop';
const BOARD = 'alma-board';
const ALMA = 7;
const PLAN = '11111111-2222-3333-4444-555555555555';
const JOB_BRANCH = 'agent/atlas-job-11111111-1';
const PROJECT = { id: 'shop-project', name: 'shop', repo: REPO, path: null, owner_agent_id: 'shared' };
const BOARD_CALL = { workspaceId: BOARD, userId: ALMA };

// ── the made-up database ────────────────────────────────────────────
const db = { subs: new Map(), plans: [], branches: [], project: PROJECT };
const keyOf = (row) => [row.job_kind, row.job_id, row.job_part, row.repo].join('|');
// keep: the statement keeps a branch already saved when the new one is empty.
function upsert(row, { keep = false } = {}) {
  const at = db.branches.findIndex((old) => keyOf(old) === keyOf(row));
  if (at < 0) {
    db.branches.push(row);
    return row;
  }
  const old = db.branches[at];
  const branch = keep ? row.branch ?? old.branch ?? null : row.branch;
  const next = { ...old, ...row, branch };
  if (keep && 'blocked_reason' in row) next.blocked_reason = branch ? null : row.blocked_reason;
  db.branches[at] = next;
  return next;
}
const pool = {
  on: jest.fn(), end: jest.fn(), connect: jest.fn(),
  query: jest.fn(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM sub_agents')) return { rows: db.subs.has(params[0]) ? [db.subs.get(params[0])] : [] };
    if (text.includes('UPDATE sub_agents')) {
      const sub = db.subs.get(params.at(-2));
      if (sub && text.includes('github_branch')) sub.github_branch = params[0];
      return { rows: sub ? [sub] : [] };
    }
    if (text.includes('FROM censai_plans')) {
      // No person in the statement means everyone's plans, as the statement would give.
      const person = text.includes('user_id = $2') ? params[1] : null;
      return { rows: db.plans.filter((plan) => plan.workspace_id === params[0] && plan.status === 'running' && (person === null || plan.user_id === person)) };
    }
    if (text.includes('FROM worker_job_branches')) {
      const [job_kind, job_id, job_part, repo] = params;
      return { rows: db.branches.filter((row) => keyOf(row) === keyOf({ job_kind, job_id, job_part, repo })) };
    }
    if (text.includes('INSERT INTO worker_job_branches')) {
      const [workspace_id, agent_id, job_kind, job_id, job_part, repo, branch, ...rest] = params;
      const base = { workspace_id, agent_id, job_kind, job_id, job_part, repo, branch };
      const row = text.includes('$10')
        ? { ...base, blocked_reason: null, pr_number: rest[0], pr_url: rest[1], pr_head_sha: rest[2] }
        : { ...base, blocked_reason: rest[0] };
      return { rows: [upsert(row, { keep: text.includes('COALESCE(EXCLUDED.branch') })] };
    }
    return { rows: [] };
  }),
};
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));

// Which project a call means is its own subject (tests/jobProject.test.js); here it is always the one in hand.
jest.unstable_mockModule('../server/tools/helpers.js', () => ({
  resolveProjectForCall: async () => ({ project: db.project, isSubAgent: false }),
  resolveLocalProjectRoot: async () => null,
  localApiUrl: (to) => `http://127.0.0.1:3001${to}`,
  fetchGithub: async (endpoint, options = {}) => {
    const res = await fetch(`https://api.github.com${endpoint}`, options);
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    return res.json();
  },
}));

// ── the made-up GitHub ──────────────────────────────────────────────
const github = { main: 'master', branches: new Set(), pulls: [], calls: [], refuseNewBranch: 0, loseNewBranch: false };
const answer = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
function githubFetch(url, options = {}) {
  const method = options.method || 'GET';
  const { pathname, searchParams } = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  github.calls.push({ method, pathname, body });
  const rest = pathname.replace(`/repos/${REPO}`, '');
  if (rest === '') return answer(200, { default_branch: github.main });
  if (rest.startsWith('/git/refs/heads/')) {
    const name = rest.slice('/git/refs/heads/'.length);
    return github.branches.has(name) ? answer(200, { object: { sha: 'main-sha' } }) : answer(404, { message: 'Not Found' });
  }
  if (rest === '/git/refs' && method === 'POST') {
    if (github.refuseNewBranch) return answer(github.refuseNewBranch, { message: 'Resource not accessible by personal access token' });
    if (!github.loseNewBranch) github.branches.add(body.ref.replace('refs/heads/', ''));
    return answer(201, { ref: body.ref });
  }
  if (rest.startsWith('/contents/')) {
    if (method === 'PUT') return answer(200, { commit: { sha: 'new-sha', html_url: 'https://github.example/commit/new-sha' } });
    return answer(404, { message: 'Not Found' });
  }
  if (rest === '/pulls' && method === 'POST') {
    const pull = { number: 41 + github.pulls.length, html_url: `https://github.example/${REPO}/pull/${41 + github.pulls.length}`, head: { ref: body.head, sha: 'head-sha-1' }, base: { ref: body.base } };
    github.pulls.push(pull);
    return answer(201, pull);
  }
  if (rest === '/pulls') {
    const head = (searchParams.get('head') || '').split(':')[1];
    return answer(200, github.pulls.filter((pull) => pull.head.ref === head));
  }
  return answer(404, { message: 'Not Found' });
}
const sent = (method, part) => github.calls.filter((call) => call.method === method && call.pathname.includes(part));
const fileWrites = () => sent('PUT', '/contents/');
const pullsOpened = () => sent('POST', '/pulls');

const priorToken = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = 'made-up-token';

const { handleProjectsTool } = await import('../server/tools/handlers/projects.js');
const { githubWriteFile } = await import('../server/tools/handlers/git/github.js');
const { ensureSubAgentBranch } = await import('../server/workspaces/subagents.js');
const { runInJobProject } = await import('../server/tools/jobProject.js');
const { runInPlanJob } = await import('../server/tools/jobRun.js');
const { writeBranchRefusal } = await import('../server/workspaces/branchGuard.js');
const { saveWorkerBranch } = await import('../server/workspaces/workerBranches.js');

const tool = (agentId, name, args = {}, context = BOARD_CALL) => handleProjectsTool(agentId, name, args, context);
/** The call as part of the job Censai handed `agentId` in the plan's project. */
const onJob = (agentId, name, args, context) => runInJobProject({ agentId, project: 'shop' }, () => tool(agentId, name, args, context));
const CHANGE = { path: 'src/price.js', content: 'export const price = 5;\n' };

function handOff(agentId, { kind = 'code', status = 'working', id = PLAN, userId = ALMA } = {}) {
  db.plans.push({ id, workspace_id: BOARD, user_id: userId, project: 'shop', status: 'running', jobs: [{ n: 1, agentId, kind, status }] });
}
function subAgent(id, permission, github_branch = null) {
  const sub = { id, name: id, parent_id: 'atlas', workspace_id: BOARD, permission, project_id: PROJECT.id, github_branch };
  db.subs.set(id, sub);
  return sub;
}

beforeEach(() => {
  pool.query.mockClear();
  db.subs.clear();
  db.plans.length = 0;
  db.branches.length = 0;
  db.project = PROJECT;
  Object.assign(github, { main: 'master', branches: new Set(['master']), pulls: [], calls: [], refuseNewBranch: 0, loseNewBranch: false });
  global.fetch = jest.fn(async (url, options) => githubFetch(url, options));
});

afterAll(() => {
  delete global.fetch;
  if (priorToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = priorToken;
});

describe('GitHub will not make the branch (403)', () => {
  beforeEach(() => { github.refuseNewBranch = 403; });

  test('a family agent on a coding job changes nothing, master stays untouched, and it is told why', async () => {
    handOff('atlas');
    const results = [
      await onJob('atlas', 'project_write', CHANGE),
      await onJob('atlas', 'project_edit', { path: 'README.md', old_string: 'a', new_string: 'b' }),
      await onJob('atlas', 'project_multi_edit', { edits: [{ path: 'README.md', old_string: 'a', new_string: 'b' }] }),
    ];
    expect(fileWrites()).toHaveLength(0);
    for (const result of results) {
      expect(result).toMatch(/^Error: Blocked\. Nothing was changed\./);
      expect(result).toContain('would not let this computer\'s key make a branch');
      expect(result).toContain('403');
    }
    // The job's own note says why, for whoever looks at the job.
    expect(db.branches).toEqual([expect.objectContaining({
      job_kind: 'plan_job', job_id: PLAN, job_part: 1, repo: REPO, branch: null,
      blocked_reason: expect.stringContaining('403'),
    })]);
  });

  test('a worker sub-agent whose branch could not be made has no branch, and its changes are refused', async () => {
    const sub = subAgent('builder-1', 'worker');
    await expect(ensureSubAgentBranch(PROJECT, sub)).rejects.toThrow(/No branch could be made.*403/);
    expect(sub.github_branch).toBeNull();
    const result = await tool('builder-1', 'project_write', CHANGE);
    expect(result).toMatch(/^Error: Blocked\. Nothing was changed\./);
    expect(result).toContain('403');
    expect(fileWrites()).toHaveLength(0);
  });

  test('a branch GitHub says it made but does not show is not trusted', async () => {
    github.refuseNewBranch = 0;
    github.loseNewBranch = true;
    handOff('atlas');
    expect(await onJob('atlas', 'project_write', CHANGE)).toContain('not there when read back');
    expect(fileWrites()).toHaveLength(0);
  });
});

describe('nothing is written to the main branch, whoever asks', () => {
  test('a family agent with no coding job is refused instead of landing on master', async () => {
    expect(await tool('atlas', 'project_write', CHANGE)).toMatch(/^Error: Blocked\. Nothing was changed\..*no coding job/);
    // A write-up job is not a coding job either.
    handOff('atlas', { kind: 'answer' });
    expect(await onJob('atlas', 'project_write', CHANGE)).toMatch(/no coding job/);
    expect(fileWrites()).toHaveLength(0);
  });

  test('a worker whose branch is the main branch, or a protected name, is refused', async () => {
    subAgent('on-master', 'worker', 'master');
    subAgent('on-main', 'worker', 'main');
    github.main = 'stable';
    github.branches.add('stable');
    subAgent('on-default', 'worker', 'stable');
    for (const id of ['on-master', 'on-main', 'on-default']) {
      expect(await tool(id, 'project_write', CHANGE)).toMatch(/^Error: Blocked\. Nothing was changed\..*main branch/);
      expect(await tool(id, 'submit_pr', { title: 'Made-up change', body: 'Made-up words' })).toMatch(/^Error: No pull request was opened\..*main branch/);
    }
    expect(fileWrites()).toHaveLength(0);
    expect(pullsOpened()).toHaveLength(0);
  });

  test('a job whose noted branch is the main branch is refused', async () => {
    handOff('atlas');
    db.branches.push({ job_kind: 'plan_job', job_id: PLAN, job_part: 1, repo: REPO, branch: 'master' });
    expect(await onJob('atlas', 'project_write', CHANGE)).toMatch(/^Error: Blocked\. Nothing was changed\..*main branch/);
    expect(fileWrites()).toHaveLength(0);
  });

  test('when GitHub will not say which branch is the main one, nothing goes through', async () => {
    subAgent('builder-1', 'worker', 'agent/builder-1');
    global.fetch = jest.fn(async (url, options) => (
      String(url).endsWith(`/repos/${REPO}`) ? answer(500, { message: 'Server Error' }) : githubFetch(url, options)
    ));
    expect(await tool('builder-1', 'project_write', CHANGE)).toMatch(/did not say which branch is the project's main one/);
    expect(fileWrites()).toHaveLength(0);
  });

  test('the direct GitHub write tool needs a work branch and never takes the main one', async () => {
    const file = { repo: REPO, path: 'notes.md', content: 'Made-up words', message: 'Made-up change' };
    expect(await githubWriteFile(file)).toMatch(/^Error: Nothing was changed\. There is no branch/);
    expect(await githubWriteFile({ ...file, branch: 'master' })).toMatch(/^Error: Nothing was changed\..*main branch/);
    expect(await githubWriteFile({ ...file, branch: 'refs/heads/master' })).toMatch(/main branch/);
    expect(fileWrites()).toHaveLength(0);
    expect(await githubWriteFile({ ...file, branch: 'fix/notes' })).toMatch(/^Successfully wrote file/);
    expect(fileWrites().map((call) => call.body.branch)).toEqual(['fix/notes']);
  });

  test('refreshing the brief of a GitHub project keeps it in the app and writes nothing to the repo', async () => {
    const prior = process.env.CENSAI_STATE_DIR;
    process.env.CENSAI_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-state-'));
    try {
      // It is no longer refused: it reads the repo (this made-up GitHub has no file list to
      // give, so the read itself fails here; tests/githubOpenReadOnly.test.js shows it working).
      const result = await tool('atlas', 'refresh_brief', {}).catch((err) => err.message);
      expect(result).not.toMatch(/Nothing was changed/);
      expect(github.calls.some((call) => call.method === 'GET')).toBe(true);
      expect(fileWrites()).toHaveLength(0);
    } finally {
      fs.rmSync(process.env.CENSAI_STATE_DIR, { recursive: true, force: true });
      if (prior === undefined) delete process.env.CENSAI_STATE_DIR; else process.env.CENSAI_STATE_DIR = prior;
    }
  });
});

describe('a family agent on a coding job', () => {
  test('gets its own branch first, changes land there, and its pull request is noted against the job', async () => {
    handOff('atlas');
    const wrote = await onJob('atlas', 'project_write', CHANGE);
    expect(wrote).toContain(`on \`${JOB_BRANCH}\``);
    // The branch was made from master and read back before the file went in.
    const order = github.calls.map((call) => `${call.method} ${call.pathname.replace(`/repos/${REPO}`, '')}`);
    expect(order.indexOf('POST /git/refs')).toBeGreaterThan(-1);
    expect(order.lastIndexOf(`GET /git/refs/heads/${JOB_BRANCH}`)).toBeGreaterThan(order.indexOf('POST /git/refs'));
    expect(order.indexOf('PUT /contents/src/price.js')).toBeGreaterThan(order.lastIndexOf(`GET /git/refs/heads/${JOB_BRANCH}`));
    expect(fileWrites().map((call) => call.body.branch)).toEqual([JOB_BRANCH]);

    const result = await onJob('atlas', 'submit_pr', { title: 'Fix the price', body: 'Made-up words' });
    expect(result).toBe(`Opened PR #41: https://github.example/${REPO}/pull/41`);
    expect(pullsOpened().map((call) => call.body)).toEqual([expect.objectContaining({ head: JOB_BRANCH, base: 'master', title: 'Fix the price' })]);
    expect(db.branches).toEqual([expect.objectContaining({
      workspace_id: BOARD, agent_id: 'atlas', job_kind: 'plan_job', job_id: PLAN, job_part: 1, repo: REPO,
      branch: JOB_BRANCH, blocked_reason: null,
      pr_number: 41, pr_url: `https://github.example/${REPO}/pull/41`, pr_head_sha: 'main-sha',
    })]);
  });

  test('asking for the pull request a second time gives back the first one', async () => {
    handOff('atlas');
    await onJob('atlas', 'project_write', CHANGE);
    await onJob('atlas', 'submit_pr', { title: 'Fix the price', body: 'Made-up words' });
    const again = await onJob('atlas', 'submit_pr', { title: 'Fix the price again', body: 'Made-up words' });
    expect(again).toBe(`Pull request #41 is already open for \`${JOB_BRANCH}\`: https://github.example/${REPO}/pull/41`);
    expect(pullsOpened()).toHaveLength(1);
    expect(db.branches).toHaveLength(1);
    expect(db.branches[0].pr_number).toBe(41);
  });

  test('reads its own branch while the job is being worked on or checked, so it sees its own changes', async () => {
    handOff('atlas');
    await onJob('atlas', 'project_write', CHANGE);
    db.plans[0].jobs[0].status = 'checking';
    github.calls.length = 0;
    global.fetch = jest.fn(async (url, options) => {
      githubFetch(url, options);
      return answer(200, { type: 'file', path: 'src/price.js', content: Buffer.from(CHANGE.content).toString('base64') });
    });
    expect(await tool('atlas', 'project_read', { project: 'shop', path: 'src/price.js' })).toContain('price = 5');
    expect(String(global.fetch.mock.calls.at(-1)[0])).toContain(`ref=${encodeURIComponent(JOB_BRANCH)}`);
  });
});

describe('who may open a pull request', () => {
  const PR = { title: 'Made-up change', body: 'Made-up words' };

  test('not a family agent with no coding job, even when a branch exists from a job that is over', async () => {
    expect(await tool('atlas', 'submit_pr', PR)).toMatch(/^Error: No pull request was opened\..*no coding job/);
    // Another agent's job is not atlas's job.
    handOff('genesis');
    db.branches.push({ job_kind: 'plan_job', job_id: PLAN, job_part: 1, repo: REPO, branch: 'agent/genesis-job-11111111-1' });
    expect(await onJob('atlas', 'submit_pr', PR)).toMatch(/no coding job/);
    // A finished job no longer opens one.
    db.plans[0].jobs[0] = { n: 1, agentId: 'atlas', kind: 'code', status: 'done' };
    expect(await onJob('atlas', 'submit_pr', PR)).toMatch(/no coding job/);
    expect(pullsOpened()).toHaveLength(0);
  });

  test('not a reviewer and not a researcher', async () => {
    subAgent('reader-1', 'reviewer', 'agent/reader-1');
    subAgent('finder-1', 'researcher', 'agent/finder-1');
    github.branches.add('agent/reader-1').add('agent/finder-1');
    expect(await tool('reader-1', 'submit_pr', PR)).toBe('Error: reviewer sub-agents cannot open pull requests. Only workers can.');
    expect(await tool('finder-1', 'submit_pr', PR)).toBe('Error: researcher sub-agents cannot open pull requests. Only workers can.');
    for (const id of ['reader-1', 'finder-1']) expect(await tool(id, 'project_write', CHANGE)).toMatch(/^Error: /);
    expect(pullsOpened()).toHaveLength(0);
    expect(fileWrites()).toHaveLength(0);
  });

  test('a worker sub-agent opens one from its own branch, and it is noted against the worker', async () => {
    subAgent('builder-1', 'worker', 'agent/builder-1');
    github.branches.add('agent/builder-1');
    expect(await tool('builder-1', 'project_write', CHANGE)).toContain('on `agent/builder-1`');
    expect(await tool('builder-1', 'submit_pr', PR)).toBe(`Opened PR #41: https://github.example/${REPO}/pull/41`);
    expect(await tool('builder-1', 'submit_pr', PR)).toMatch(/^Pull request #41 is already open/);
    expect(pullsOpened()).toHaveLength(1);
    expect(db.branches).toEqual([expect.objectContaining({
      job_kind: 'sub_agent', job_id: 'builder-1', branch: 'agent/builder-1', pr_number: 41, pr_head_sha: 'main-sha',
    })]);
  });

  test('a worker made without a branch gets one on its first change', async () => {
    subAgent('builder-2', 'worker');
    expect(await tool('builder-2', 'project_write', CHANGE)).toContain('on `agent/builder-2-builder-2`');
    // Saved for the worker on this board, by what was sent to the database.
    const saved = pool.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE sub_agents'));
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toContain('github_branch = $1');
    expect(saved[0][1]).toEqual(['agent/builder-2-builder-2', 'builder-2', BOARD]);
    expect(fileWrites().map((call) => call.body.branch)).toEqual(['agent/builder-2-builder-2']);
  });
});

describe('a project in a folder on this computer', () => {
  test('is changed as before, with no branch and no GitHub', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-branch-'));
    try {
      db.project = { id: 'local-shop', name: 'local-shop', repo: null, path: folder, owner_agent_id: 'shared' };
      const result = await tool('atlas', 'project_write', CHANGE);
      expect(result).toMatch(/^Wrote src\/price\.js in local-shop\./);
      expect(fs.readFileSync(path.join(folder, 'src', 'price.js'), 'utf8')).toBe(CHANGE.content);
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('what the model is told', () => {
  test('submit_pr says who can call it and that it needs a job branch', async () => {
    const { PROJECTS_CORE_TOOLS } = await import('../server/tools/definitions/projects-core.js').then((mod) => ({
      PROJECTS_CORE_TOOLS: Object.values(mod).find(Array.isArray),
    }));
    const words = PROJECTS_CORE_TOOLS.find((entry) => entry.function.name === 'submit_pr').function.description;
    expect(words).toMatch(/family agent/);
    expect(words).toMatch(/coding job/);
    expect(words).toMatch(/Reviewer and researcher sub-agents cannot/);
    expect(words).not.toMatch(/Only available to worker sub-agents/);
  });
});

describe('a path or a branch name cannot point the change somewhere else', () => {
  const file = { repo: REPO, content: 'Made-up words', message: 'Made-up change', branch: 'fix/notes' };
  const ESCAPES = [
    '../../../acme/site/contents/index.html', '../pulls/41/merge', 'docs/../../pulls/41/merge', './notes.md',
    '/notes.md', 'docs//notes.md', 'docs\\..\\notes.md', 'docs/', '', 'notes.md?ref=master', 'notes.md#x',
  ];

  test('the direct GitHub write tool refuses a path that leaves the repo, and GitHub is never asked', async () => {
    for (const where of ESCAPES) {
      expect(await githubWriteFile({ ...file, path: where })).toMatch(/^Error: Nothing was changed\. That is not a plain path/);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('the direct GitHub write tool spells each part of the path out', async () => {
    expect(await githubWriteFile({ ...file, path: 'docs/price list%2e.md' })).toMatch(/^Successfully wrote file/);
    const asked = global.fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/contents/'));
    expect(asked).toHaveLength(2);
    for (const url of asked) expect(url).toContain(`/repos/${REPO}/contents/docs/price%20list%252e.md`);
    expect(fileWrites().map((call) => call.body.branch)).toEqual(['fix/notes']);
  });

  test('the project tools refuse such a path in a GitHub project, for a write, an edit and a multi-edit', async () => {
    subAgent('builder-1', 'worker', 'agent/builder-1');
    github.branches.add('agent/builder-1');
    for (const where of ESCAPES.filter(Boolean)) {
      const results = [
        await tool('builder-1', 'project_write', { path: where, content: 'x' }),
        await tool('builder-1', 'project_edit', { path: where, old_string: 'a', new_string: 'b' }),
        await tool('builder-1', 'project_multi_edit', { edits: [{ path: 'README.md', old_string: 'a', new_string: 'b' }, { path: where, old_string: 'a', new_string: 'b' }] }),
      ];
      for (const result of results) expect(result).toMatch(/^Error: Blocked\. Nothing was changed\. That is not a plain path/);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a branch name that is the main branch in another spelling, or another ref, is refused', async () => {
    const ODD = [
      'Master', 'MAIN', 'refs/heads/Main', './master', 'master/.', 'master/..', 'fix/../master', 'heads/master', 'Heads/master',
      'refs/heads/refs/heads/master', 'refs/tags/v1', 'refs/pull/41/head', 'fix//notes', 'fix/notes/', '/fix', '.hidden', 'fix/notes.lock',
      'fix/notes.', 'fix notes', 'fix/notes?x', 'fix%2Fnotes', 'fix\\notes',
    ];
    for (const name of ODD) {
      expect([name, await writeBranchRefusal(REPO, name)]).toEqual([name, expect.any(String)]);
      expect(await githubWriteFile({ ...file, path: 'notes.md', branch: name })).toMatch(/^Error: Nothing was changed\./);
      subAgent('odd', 'worker', name);
      expect(await tool('odd', 'project_write', CHANGE)).toMatch(/^Error: Blocked\. Nothing was changed\./);
    }
    // The main branch under another letter case, when the repo has its own name for it.
    github.main = 'Stable';
    expect(await writeBranchRefusal(REPO, 'stable')).toMatch(/main branch/);
    expect(await writeBranchRefusal(REPO, 'refs/heads/STABLE')).toMatch(/main branch/);
    expect(fileWrites()).toHaveLength(0);
    expect(sent('POST', '/git/refs')).toHaveLength(0);
    // An ordinary name still goes through.
    expect(await writeBranchRefusal(REPO, 'fix/notes-2_b.1')).toBeNull();
    expect(await writeBranchRefusal(REPO, 'refs/heads/fix/notes')).toBeNull();
  });
});

describe('which job a change belongs to is never guessed', () => {
  const PLAN_B = '99999999-8888-7777-6666-555555555555';
  const PR = { title: 'Made-up change', body: 'Made-up words' };

  test('two plans at once for the same agent and project: the second is refused, and never lands on the first one\'s branch or pull request', async () => {
    handOff('atlas');
    await onJob('atlas', 'project_write', CHANGE);
    await onJob('atlas', 'submit_pr', PR);
    handOff('atlas', { id: PLAN_B });
    github.calls.length = 0;
    expect(await onJob('atlas', 'project_write', CHANGE)).toMatch(/^Error: Blocked\. Nothing was changed\. You have more than one coding job in hand/);
    expect(await onJob('atlas', 'submit_pr', PR)).toMatch(/^Error: No pull request was opened\. You have more than one coding job in hand/);
    expect(fileWrites()).toHaveLength(0);
    expect(pullsOpened()).toHaveLength(0);
    expect(db.branches).toHaveLength(1);
  });

  test('a run that says which plan and job it is gets that job\'s own branch and pull request', async () => {
    handOff('atlas');
    handOff('atlas', { id: PLAN_B });
    const inPlan = (planId, name, args) => runInPlanJob({ planId, part: 1 }, () => onJob('atlas', name, args));
    expect(await inPlan(PLAN, 'project_write', CHANGE)).toContain('on `agent/atlas-job-11111111-1`');
    expect(await inPlan(PLAN_B, 'project_write', CHANGE)).toContain('on `agent/atlas-job-99999999-1`');
    expect(await inPlan(PLAN, 'submit_pr', PR)).toMatch(/^Opened PR #41/);
    expect(await inPlan(PLAN_B, 'submit_pr', PR)).toMatch(/^Opened PR #42/);
    expect(fileWrites().map((call) => call.body.branch)).toEqual(['agent/atlas-job-11111111-1', 'agent/atlas-job-99999999-1']);
    expect(db.branches.map((row) => [row.job_id, row.branch, row.pr_number])).toEqual([
      [PLAN, 'agent/atlas-job-11111111-1', 41], [PLAN_B, 'agent/atlas-job-99999999-1', 42],
    ]);
    // A plan id that is not this person's running plan is no job at all.
    expect(await inPlan('00000000-0000-0000-0000-000000000000', 'project_write', CHANGE)).toMatch(/no coding job/);
  });

  test('another person\'s plan on the same board is not this person\'s job', async () => {
    const SAM = 8;
    handOff('atlas', { userId: SAM });
    expect(await onJob('atlas', 'project_write', CHANGE)).toMatch(/no coding job/);
    expect(await onJob('atlas', 'submit_pr', PR)).toMatch(/no coding job/);
    // With a job of each, Alma's call works on Alma's job alone.
    handOff('atlas', { id: PLAN_B });
    expect(await onJob('atlas', 'project_write', CHANGE)).toContain('on `agent/atlas-job-99999999-1`');
    // A call with no one behind it has no job.
    expect(await onJob('atlas', 'project_write', CHANGE, { workspaceId: BOARD })).toMatch(/no coding job/);
    expect(fileWrites()).toHaveLength(1);
  });

  test('a try that failed never takes away a branch already saved for the job', async () => {
    handOff('atlas');
    await onJob('atlas', 'project_write', CHANGE);
    const job = { kind: 'plan_job', id: PLAN, part: 1 };
    const row = await saveWorkerBranch(pool, { workspaceId: BOARD, agentId: 'atlas', job, repo: REPO, blockedReason: 'GitHub could not be reached to make the branch.' });
    expect(row).toEqual(expect.objectContaining({ branch: JOB_BRANCH, blocked_reason: null }));
    expect(db.branches).toEqual([expect.objectContaining({ branch: JOB_BRANCH, blocked_reason: null })]);
    // The next change still goes on the job's branch, and no second branch is made.
    expect(await onJob('atlas', 'project_write', CHANGE)).toContain(`on \`${JOB_BRANCH}\``);
    expect(sent('POST', '/git/refs')).toHaveLength(1);
  });
});
