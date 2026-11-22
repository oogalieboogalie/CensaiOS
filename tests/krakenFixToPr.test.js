import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakePlanDb } from './support/censaiPlanDb.js';
// A Kraken fix goes all the way to a pull request. The real feeder, runner, job checks, project
// tools and pull-request opener run; stand-ins: GitHub at the fetch level (acme/shop), the plan
// and job-branch tables, the request store, and the agent's model. Alma (user 7), Trust mode on for Atlas.

const REPO = 'acme/shop';
const BOARD = 'ws-1';
const ALMA = 7;
const SCOPE = { workspaceId: BOARD, userId: ALMA };
const PINNED = 'a'.repeat(40); // the commit Alma looked at
const MAIN_HEAD = 'f'.repeat(40); // main has moved on since
const CLOUD = { id: 'p-cloud', name: 'shop', repo: REPO, path: null, owner_agent_id: 'shared' };
const PIN = { projectId: 'p-cloud', name: 'shop', kind: 'github', source: REPO, branch: 'main', commit: PINNED };
const CHANGE = { path: 'src/price.js', content: 'export const price = 5;\n' };

// ── the made-up database: the plan table, the job-branch table, the projects ──
const plansDb = fakePlanDb({ trust: [{ agent_id: 'atlas', trusted: true }] });
const branchRows = [];
const local = { row: null };
const keyOf = (row) => [row.job_kind, row.job_id, Number(row.job_part), row.repo].join('|');
function upsertBranch(row) {
  const at = branchRows.findIndex((old) => keyOf(old) === keyOf(row));
  if (at < 0) {
    branchRows.push(row);
    return row;
  }
  const old = branchRows[at];
  branchRows[at] = { ...old, ...row, branch: row.branch ?? old.branch ?? null };
  return branchRows[at];
}
const pool = {
  on: jest.fn(), end: jest.fn(), connect: jest.fn(),
  query: jest.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (/CREATE (TABLE|INDEX|UNIQUE)/i.test(text)) return { rows: [] };
    if (text.startsWith('SELECT id, project, jobs FROM censai_plans')) {
      const rows = [...plansDb.plans.values()].filter((row) => row.workspace_id === params[0] && row.user_id === params[1] && row.status === 'running');
      return { rows: rows.map((row) => ({ id: row.id, project: row.project, jobs: structuredClone(row.jobs) })) };
    }
    if (text.includes('FROM worker_job_branches WHERE job_kind = $1')) {
      return { rows: branchRows.filter((row) => keyOf(row) === keyOf({ job_kind: params[0], job_id: params[1], job_part: params[2], repo: params[3] })) };
    }
    if (text.includes("FROM worker_job_branches WHERE job_kind = 'plan_job' AND job_id = $1")) {
      return { rows: branchRows.filter((row) => row.job_kind === 'plan_job' && row.job_id === params[0]) };
    }
    if (text.startsWith('INSERT INTO worker_job_branches')) {
      const [workspace_id, agent_id, job_kind, job_id, job_part, repo, branch, ...rest] = params;
      const base = { workspace_id, agent_id, job_kind, job_id, job_part, repo, branch };
      const row = text.includes('pr_number') && text.includes('$10')
        ? { ...base, blocked_reason: null, pr_number: rest[0], pr_url: rest[1], pr_head_sha: rest[2] }
        : { ...base, blocked_reason: rest[0] };
      return { rows: [upsertBranch(row)] };
    }
    // The folders on this computer that might hold a GitHub project (workspaces/ownerTrust.js).
    if (text.startsWith('SELECT * FROM projects WHERE (repo IS NULL')) return { rows: local.row ? [local.row] : [] };
    if (text.includes('FROM sub_agents')) return { rows: [] };
    try {
      return await plansDb.query(sql, params);
    } catch (error) {
      if (/unexpected SQL/.test(error.message)) return { rows: [] }; // activity notes and the like: nothing to keep
      throw error;
    }
  }),
};
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));

// Which project a name or id means on this board: the GitHub project (the board's rules are tests/censaiHandoffProjectAccess.test.js).
jest.unstable_mockModule('../server/workspaces/ownerProjectLookup.js', () => ({
  resolveProjectForDriver: jest.fn(async (_db, { projectIdentifier }) => {
    if ([CLOUD.id, CLOUD.name, REPO].includes(String(projectIdentifier))) return CLOUD;
    // The owner rule finds any folder on this computer by its name (workspaces/ownerProjectLookup.js).
    if (local.row && [local.row.id, local.row.name].includes(String(projectIdentifier))) return local.row;
    throw Object.assign(new Error('There is no such project.'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
  }),
}));

// The Kraken request store, in memory.
const requests = new Map();
jest.unstable_mockModule('../server/kraken/store.js', () => ({
  listOpenRequests: jest.fn(async () => [...requests.values()].filter((row) => row.status === 'open')),
  getRequest: jest.fn(async (_db, { id }) => requests.get(id) || null),
  listOpenOwners: jest.fn(async () => []),
  saveRequest: jest.fn(async (_db, { id, status, arms }) => {
    const row = requests.get(id);
    if (!row || row.status !== 'open') return null;
    Object.assign(row, { status, arms: structuredClone(arms) });
    return row;
  }),
}));

// ── the made-up GitHub ──────────────────────────────────────────────
// checks: each commit's check result ('success', 'failure', 'running', or none yet). A commit not in
// checksBySha gets defaultChecks (null: no checks yet). A pull request keeps the head commit it
// was opened at, the way GitHub can lag a new push. workflows: how many Actions workflows the repo has.
const github = { branches: new Map(), files: new Map(), pulls: [], calls: [], scopes: 'repo', checksBySha: new Map(), defaultChecks: 'success', workflows: 1 };
function checkRuns(sha) {
  const result = github.checksBySha.has(sha) ? github.checksBySha.get(sha) : github.defaultChecks;
  if (!result) return [];
  return [result === 'running'
    ? { name: 'tests', head_sha: sha, status: 'in_progress', conclusion: null }
    : { name: 'tests', head_sha: sha, status: 'completed', conclusion: result }];
}
function reply(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status < 400, status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => text,
  };
}
function githubFetch(url, options = {}) {
  const method = options.method || 'GET';
  const { pathname, searchParams } = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  github.calls.push({ method, pathname, body });
  const rest = pathname.replace(`/repos/${REPO}`, '');
  if (rest === '') {
    return reply(200, { default_branch: 'main', private: false, archived: false, has_pull_requests: true, permissions: { push: true } }, github.scopes === null ? {} : { 'x-oauth-scopes': github.scopes });
  }
  const checks = /^\/commits\/([^/]+)\/(check-runs|status)$/.exec(rest);
  if (checks) {
    const sha = decodeURIComponent(checks[1]);
    // A commit status from CI outside GitHub Actions, when the test set one.
    const outside = github.statusBySha.get(sha);
    if (checks[2] === 'status') return reply(200, { sha, state: outside || 'pending', statuses: outside ? [{ context: 'ci/outside', state: outside }] : [] });
    return reply(200, { check_runs: checkRuns(sha) });
  }
  const commit = /^\/commits\/([^/]+)$/.exec(rest);
  if (commit) {
    const ref = decodeURIComponent(commit[1]);
    const sha = /^[0-9a-f]{40}$/.test(ref) ? ref : github.branches.get(ref);
    if (!sha) return reply(404, { message: 'No commit found' });
    const wantsSha = String(options.headers?.Accept || options.headers?.accept || '').includes('sha');
    return wantsSha ? reply(200, sha) : reply(200, { sha });
  }
  if (rest.startsWith('/git/refs/heads/')) {
    const name = decodeURIComponent(rest.slice('/git/refs/heads/'.length));
    return github.branches.has(name) ? reply(200, { object: { sha: github.branches.get(name) } }) : reply(404, { message: 'Not Found' });
  }
  if (rest === '/git/refs' && method === 'POST') {
    github.branches.set(body.ref.replace('refs/heads/', ''), body.sha);
    return reply(201, { ref: body.ref });
  }
  if (rest.startsWith('/contents/')) {
    const file = decodeURIComponent(rest.slice('/contents/'.length));
    if (method === 'PUT') {
      github.commits += 1;
      const sha = `${String(github.commits).padStart(2, '0')}${'e'.repeat(38)}`;
      github.files.set(`${body.branch}:${file}`, Buffer.from(body.content, 'base64').toString('utf8'));
      github.branches.set(body.branch, sha);
      return reply(200, { commit: { sha, html_url: `https://github.example/commit/${sha}` } });
    }
    const at = `${searchParams.get('ref')}:${file}`;
    return github.files.has(at)
      ? reply(200, { type: 'file', path: file, sha: 'blob', content: Buffer.from(github.files.get(at)).toString('base64') })
      : reply(404, { message: 'Not Found' });
  }
  if (rest.startsWith('/actions/workflows')) return reply(200, { total_count: github.workflows, workflows: [] });
  if (rest === '/pulls' && method === 'POST') {
    const number = 41 + github.pulls.length;
    const pull = { number, html_url: `https://github.example/${REPO}/pull/${number}`, head: { ref: body.head, sha: github.branches.get(body.head) }, base: { ref: body.base } };
    github.pulls.push(pull);
    return reply(201, pull);
  }
  if (rest === '/pulls') {
    const head = (searchParams.get('head') || '').split(':')[1];
    return reply(200, github.pulls.filter((pull) => pull.head.ref === head));
  }
  return reply(404, { message: 'Not Found' });
}
const sent = (method, part) => github.calls.filter((call) => call.method === method && call.pathname.includes(part));

const priorToken = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = 'made-up-token';

const { feed } = await import('../server/kraken/feeder.js');
const { buildArms, publicRequest, withTaskIds } = await import('../server/kraken/arms.js');
const { planSettled, recoverOnce, resetPlansForTests } = await import('../server/censaiOrchestrator/runner.js');
const { isParked, lookAtParked } = await import('../server/censaiOrchestrator/parkedChecks.js');
const { handleProjectsTool } = await import('../server/tools/handlers/projects.js');

// ── the family agent and Censai's model ─────────────────────────────
const turnResults = [];
let turnGate = null; // when set, each turn waits for it before saving
const turns = [];
let turnWrites = []; // extra saves a turn makes first (arguments for project_write)
let failTurn = 0; // the turn number that fails, or 0
const clock = { at: Date.parse('2026-11-01T10:00:00Z') };
const WAIT_MS = 20 * 60 * 1000;
const commit = (n) => `${String(n).padStart(2, '0')}${'e'.repeat(38)}`; // the made-up GitHub's nth commit
function planDeps() {
  return {
    db: pool,
    now: () => clock.at,
    prChecksWaitMs: WAIT_MS,
    checkPin: async () => null,
    whyTestsCannotRun: async () => null, // Alma is this computer's owner (tests/censaiOrchestratorTools.test.js covers the refusal)
    runAgent: jest.fn(async (input) => {
      turns.push(input.conversationId);
      if (turnGate) await turnGate(input);
      if (failTurn === turns.length) throw Object.assign(new Error('the model did not answer'), { code: 'MODEL_DOWN' });
      const context = { workspaceId: input.workspaceId, userId: input.userId };
      for (const args of turnWrites) turnResults.push(await handleProjectsTool(input.agentId, 'project_write', args, context));
      const result = await handleProjectsTool(input.agentId, 'project_write', CHANGE, context);
      const ok = !/^Error/.test(result);
      return {
        finalText: ok ? `I changed ${CHANGE.path} so the price is 5.` : `I could not save it: ${result}`,
        toolActions: [{ tool: 'project_write', ok, args: { path: CHANGE.path }, summary: { path: CHANGE.path }, result_preview: result }],
      };
    }),
    sendMail: jest.fn(async () => 100 + turns.length),
    markRead: jest.fn(async () => true),
    censaiModel: jest.fn(async () => ({ model: 'stand-in' })),
    askCensai: jest.fn(async (_model, messages) => (/tell the person what got done/.test(messages[0].content)
      ? 'Atlas fixed the price, and its pull request is open with its checks passing.'
      : '1 PASS Atlas changed src/price.js.')),
  };
}
const deps = () => ({ db: pool, recoverOnce: async () => {}, requireMember: async () => ({ role: 'owner' }), planDeps: planDeps() });

const FINDING = (n, title) => ({ n, severity: 'P1', title, body: 'The price shows 4 instead of 5.', owner: 'Atlas', doneWhen: [], files: ['src/price.js'] });
function release(pin, findings = [FINDING(1, 'The price is wrong')]) {
  const id = `req-${requests.size + 1}`;
  const arms = withTaskIds(buildArms(findings, { mode: 'fix', project: pin.projectId }));
  requests.set(id, { id, project: pin.name, pin, mode: 'fix', status: 'open', arms, workspace_id: BOARD, user_id: ALMA, title: 'Review' });
  return id;
}
const shown = (id) => publicRequest({ ...requests.get(id), created_at: null, updated_at: null, finished_at: null });
const settled = async (id) => { for (const arm of requests.get(id).arms) if (arm.planId) await planSettled(arm.planId); };
/** Hand out and let every plan run until it ends or waits for its checks; then look, the way the window does. */
async function runToWait(id) {
  await feed(SCOPE, deps());
  await settled(id);
  await feed(SCOPE, deps());
  return shown(id);
}
/** One look at the parked checks (the timer's), then let what it started run. */
async function checksLook(id) {
  await lookAtParked();
  await settled(id);
  await feed(SCOPE, deps());
  return shown(id);
}
/** Run the request to its end, looking at the checks until nothing waits on them. */
async function runToEnd(id) {
  let request = await runToWait(id);
  for (let i = 0; i < 6 && requests.get(id).arms.some((arm) => arm.planId && isParked(arm.planId)); i += 1) request = await checksLook(id);
  return request;
}

let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kraken-pr-'));
  requests.clear();
  branchRows.length = 0;
  plansDb.plans.clear();
  turns.length = 0;
  turnResults.length = 0;
  turnWrites = [];
  failTurn = 0;
  turnGate = null;
  local.row = null;
  Object.assign(github, { branches: new Map([['main', MAIN_HEAD]]), files: new Map(), pulls: [], calls: [], scopes: 'repo', checksBySha: new Map(), defaultChecks: 'success', workflows: 1, commits: 0, statusBySha: new Map() });
  global.fetch = jest.fn(async (url, options) => githubFetch(url, options));
});
afterEach(() => {
  resetPlansForTests();
  fs.rmSync(temp, { recursive: true, force: true });
});
afterAll(() => {
  delete global.fetch;
  if (priorToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = priorToken;
});

function expectOnePrFromTheJobBranch(request) {
  const [arm] = request.arms;
  const plan = plansDb.row(arm.planId);
  const jobBranch = `agent/atlas-job-${arm.planId.slice(0, 8)}-1`;
  // The job's branch was made at the pinned commit, not where main is now.
  expect(sent('POST', '/git/refs').map((call) => call.body)).toEqual([{ ref: `refs/heads/${jobBranch}`, sha: PINNED }]);
  // The agent's change landed on that branch, and nothing was written to main.
  expect(sent('PUT', '/contents/').map((call) => call.body.branch)).toEqual([jobBranch]);
  expect([...github.files.keys()]).toEqual([`${jobBranch}:${CHANGE.path}`]);
  expect(github.branches.get('main')).toBe(MAIN_HEAD);
  // The job checked out, and exactly one pull request was opened from its branch and noted against the job.
  expect(plan.status).toBe('done');
  expect(plan.jobs[0].checklist.map((item) => [item.text, item.state])).toEqual([
    ['The change the finding asks for is made, and the answer names the files that changed', 'ticked'],
    ['The pull request\'s checks on GitHub pass', 'ticked'],
  ]);
  expect(sent('POST', '/pulls').map((call) => [call.body.head, call.body.base])).toEqual([[jobBranch, 'main']]);
  expect(branchRows).toEqual([expect.objectContaining({ job_kind: 'plan_job', job_id: arm.planId, job_part: 1, repo: REPO, branch: jobBranch, pr_number: 41 })]);
  // The arm shows it, done, with its link and its checks.
  expect(request.status).toBe('done');
  expect(arm).toEqual(expect.objectContaining({
    status: 'done', kind: 'code', branch: jobBranch,
    pr: { number: 41, url: `https://github.example/${REPO}/pull/41`, branch: jobBranch, checks: 'passed', line: 'Pull request #41 is open and its checks on GitHub passed.' },
  }));
  return jobBranch;
}

describe('a Kraken fix on a project kept on GitHub ends in a pull request', () => {
  test('pinned at a commit: the arm goes out, works on its own branch from that commit, and its pull request shows on the arm', async () => {
    const id = release(PIN);
    const request = await runToEnd(id);
    expectOnePrFromTheJobBranch(request);
    // It went out as a fix, not blocked for want of tests on this computer.
    expect(request.arms[0].why).toBe('');
  });

  test('also checked out on this computer, with Trust mode on: the folder and its branch are left alone', async () => {
    const folder = path.join(temp, 'shop');
    fs.mkdirSync(path.join(folder, '.git', 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'src'));
    fs.writeFileSync(path.join(folder, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/shop.git\n');
    fs.writeFileSync(path.join(folder, '.git', 'HEAD'), 'ref: refs/heads/my-own-work\n');
    fs.writeFileSync(path.join(folder, 'src', 'price.js'), 'export const price = 4; // Alma is mid-edit\n');
    local.row = { id: 'p-shop-here', name: 'shop-here', repo: null, path: folder, owner_agent_id: 'shared' };
    const before = fs.readdirSync(folder, { recursive: true }).sort();

    const request = await runToEnd(release(PIN));
    expectOnePrFromTheJobBranch(request);
    expect(fs.readFileSync(path.join(folder, 'src', 'price.js'), 'utf8')).toBe('export const price = 4; // Alma is mid-edit\n');
    expect(fs.readFileSync(path.join(folder, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/my-own-work\n');
    expect(fs.readdirSync(folder, { recursive: true }).sort()).toEqual(before);
  });

  test('two plans at once for the same agent in the same project: each gets its own branch and its own pull request', async () => {
    let started = 0;
    let open;
    const bothIn = new Promise((resolve) => { open = resolve; });
    turnGate = async () => {
      started += 1;
      if (started === 2) open();
      await bothIn; // both turns are running before either saves a file
    };
    const id = release(PIN, [FINDING(1, 'The price is wrong'), FINDING(2, 'The tax is wrong')]);
    const request = await runToEnd(id);
    expect(started).toBe(2);
    const branches = request.arms.map((arm) => `agent/atlas-job-${arm.planId.slice(0, 8)}-1`);
    expect(new Set(branches).size).toBe(2);
    expect(request.arms.map((arm) => [arm.status, arm.branch, arm.pr?.branch])).toEqual(branches.map((branch) => ['done', branch, branch]));
    expect(sent('PUT', '/contents/').map((call) => call.body.branch).sort()).toEqual([...branches].sort());
    expect(sent('POST', '/pulls').map((call) => call.body.head).sort()).toEqual([...branches].sort());
    expect(request.arms.map((arm) => arm.pr.number).sort()).toEqual([41, 42]);
  });
});

describe('a fix that cannot reach a pull request says so', () => {
  test('a folder on this computer with no GitHub copy stays blocked, with the reason, and nothing is written', async () => {
    const folder = path.join(temp, 'notes');
    fs.mkdirSync(folder);
    const pin = { projectId: 'p-notes', name: 'notes', kind: 'folder', source: folder, branch: null, commit: null };
    const id = release(pin);
    await feed(SCOPE, { ...deps(), checkPin: async () => null }); // the folder is still the one Alma looked at
    const [arm] = publicRequest({ ...requests.get(id) }).arms;
    expect([arm.status, arm.kind]).toEqual(['blocked', 'code']);
    expect(arm.why).toContain('this folder has no GitHub copy to open a pull request on');
    expect(plansDb.plans.size).toBe(0);
    expect(fs.readdirSync(folder)).toEqual([]);
  });

  test('a key that does not say whether it may branch: the fix goes out, with a note that it may still fail', async () => {
    github.scopes = null; // a fine-grained key sends no list of what it may do
    const id = release(PIN);
    await feed(SCOPE, deps());
    const [out] = publicRequest({ ...requests.get(id) }).arms;
    expect(out.status).toBe('handed');
    expect(out.note).toMatch(/^It may still fail when it tries: In acme\/shop, .* can read\. Whether it can make a branch or open a pull request is not known yet/);
    await planSettled(requests.get(id).arms[0].planId);
  });

  test('checks that fail on the pull request: sent back once, then the arm is stuck with its pull request shown', async () => {
    github.defaultChecks = 'failure';
    const request = await runToEnd(release(PIN));
    const [arm] = request.arms;
    expect(arm.status).toBe('stuck');
    expect(arm.pr).toEqual(expect.objectContaining({ number: 41, checks: 'failed', line: 'Pull request #41 is open, and its checks on GitHub failed: tests.' }));
    expect(turns).toHaveLength(2);
    expect(sent('POST', '/pulls')).toHaveLength(1);
  });
});

/** A folder here that is a checkout of acme/shop, on Alma's own branch, with her own unsaved change. */
function checkoutHere() {
  const folder = path.join(temp, 'shop');
  fs.mkdirSync(path.join(folder, '.git', 'refs', 'heads'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'src'));
  fs.writeFileSync(path.join(folder, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/shop.git\n');
  fs.writeFileSync(path.join(folder, '.git', 'HEAD'), 'ref: refs/heads/my-own-work\n');
  fs.writeFileSync(path.join(folder, 'src', 'price.js'), 'export const price = 4; // Alma is mid-edit\n');
  local.row = { id: 'p-shop-here', name: 'shop-here', repo: null, path: folder, owner_agent_id: 'shared' };
  return folder;
}

describe('waiting for the pull request\'s checks', () => {
  test('checks that show up late are waited for, never taken as passed before they ran', async () => {
    github.defaultChecks = null; // nothing has run on the new commit yet
    const id = release(PIN);
    await runToWait(id);
    let request = await checksLook(id);
    expect(request.arms[0]).toEqual(expect.objectContaining({ status: 'handed', pr: expect.objectContaining({ number: 41, checks: 'running' }) }));
    clock.at += 5 * 60 * 1000;
    github.checksBySha.set(commit(1), 'running');
    request = await checksLook(id);
    expect(request.arms[0].pr.checks).toBe('running');
    github.checksBySha.set(commit(1), 'success');
    request = await checksLook(id);
    expect(request.arms[0]).toEqual(expect.objectContaining({ status: 'done', pr: expect.objectContaining({ checks: 'passed' }) }));
  });

  test('no check ever runs: once the wait is over it says so, and never shows "passed"', async () => {
    github.defaultChecks = null;
    const id = release(PIN);
    await runToWait(id);
    clock.at += WAIT_MS + 1000;
    const request = await checksLook(id);
    const [arm] = request.arms;
    expect(arm.pr.checks).toBe('none');
    expect(arm.pr.line).toMatch(/No checks ran on this pull request/);
    expect(arm.status).toBe('done');
    const [, item] = plansDb.row(arm.planId).jobs[0].checklist;
    expect(item).toEqual(expect.objectContaining({ checks: 'none', line: expect.stringContaining('No checks ran on this pull request') }));
  });

  test('a repo with no Actions workflow still waits: a status from CI outside GitHub can come later', async () => {
    github.defaultChecks = null;
    github.workflows = 0;
    const id = release(PIN);
    await runToWait(id);
    let request = await checksLook(id);
    expect([request.arms[0].status, request.arms[0].pr.checks]).toEqual(['handed', 'running']);
    clock.at += 10 * 60 * 1000;
    github.statusBySha.set(commit(1), 'success');
    request = await checksLook(id);
    expect([request.arms[0].status, request.arms[0].pr.checks]).toEqual(['done', 'passed']);
  });

  test('done with no checks: the result of the plan and the arm say nothing tested it, whatever the model wrote', async () => {
    github.defaultChecks = null;
    const id = release(PIN);
    await runToWait(id);
    clock.at += WAIT_MS + 1000;
    const request = await checksLook(id);
    const NOTE = 'Done, but no checks ran on its pull request, so nothing tested it.';
    expect(plansDb.row(request.arms[0].planId).summary.endsWith(NOTE)).toBe(true);
    expect(request.arms[0].result).toContain(NOTE);
  });

  test('the wait takes none of the runner\'s slots, and a restart picks up the same branch and pull request', async () => {
    github.defaultChecks = 'running';
    const id = release(PIN);
    await runToWait(id);
    const { planId } = requests.get(id).arms[0];
    // Parked: its plan is still running in the database, but nothing is running here for it.
    expect(isParked(planId)).toBe(true);
    expect(plansDb.row(planId)).toEqual(expect.objectContaining({ status: 'running' }));
    expect(plansDb.row(planId).jobs[0]).toEqual(expect.objectContaining({ status: 'waiting_checks', prWait: expect.objectContaining({ number: 41, sha: commit(1) }) }));
    // The server restarts while it waits.
    resetPlansForTests();
    expect(isParked(planId)).toBe(false);
    await recoverOnce(planDeps());
    await planSettled(planId);
    expect(isParked(planId)).toBe(true);
    github.checksBySha.set(commit(1), 'success');
    const request = await checksLook(id);
    expect(request.arms[0]).toEqual(expect.objectContaining({ status: 'done', pr: expect.objectContaining({ number: 41, checks: 'passed' }) }));
    expect(sent('POST', '/git/refs')).toHaveLength(1);
    expect(sent('POST', '/pulls')).toHaveLength(1);
    expect(turns).toHaveLength(1);
    expect(branchRows).toHaveLength(1);
  });

  test('checks on the newest push are the ones read, even while GitHub still shows the pull request at the old one', async () => {
    github.checksBySha.set(commit(1), 'failure');
    github.checksBySha.set(commit(2), 'success');
    const request = await runToEnd(release(PIN));
    expect(turns).toHaveLength(2);
    expect(github.pulls[0].head.sha).toBe(commit(1)); // GitHub never moved it here
    expect(request.arms[0]).toEqual(expect.objectContaining({ status: 'done', pr: expect.objectContaining({ checks: 'passed' }) }));
    expect(branchRows[0].pr_head_sha).toBe(commit(2));
  });

  test('checks failed on the first try and the second try did not finish: the arm says just that', async () => {
    github.defaultChecks = 'failure';
    failTurn = 2;
    const request = await runToEnd(release(PIN));
    const [arm] = request.arms;
    expect(arm.status).toBe('stuck');
    expect(arm.pr).toEqual(expect.objectContaining({ checks: 'failed', line: 'Checks failed on the first try; the second try did not finish.' }));
  });
});

describe('a fix changes nothing but its own branch', () => {
  test('a save that names the folder project here is refused, and the folder is untouched', async () => {
    const folder = checkoutHere();
    turnWrites = [{ project: 'shop-here', path: 'src/price.js', content: 'export const price = 5;\n' }];
    await runToEnd(release(PIN));
    expect(turnResults[0]).toMatch(/^Error: Blocked\. Nothing was changed\. During this fix, changes go only to its own project on GitHub/);
    expect(fs.readFileSync(path.join(folder, 'src', 'price.js'), 'utf8')).toBe('export const price = 4; // Alma is mid-edit\n');
  });

  test('a write tool outside the project tools is refused during a fix', async () => {
    const { codeJobRefusal, runInJobProject } = await import('../server/tools/jobProject.js');
    const during = (tool) => runInJobProject({ agentId: 'atlas', project: 'p-cloud', confined: true }, () => codeJobRefusal('atlas', tool));
    expect(during('local_write_file')).toMatch(/^Error: Blocked\. Nothing was changed\./);
    expect(during('sandbox_exec')).toMatch(/^Error: Blocked/);
    expect(during('project_write')).toBeNull();
    expect(runInJobProject({ agentId: 'atlas', project: 'p-cloud' }, () => codeJobRefusal('atlas', 'local_write_file'))).toBeNull();
  });

  test('a fix set up on a folder before fixes went to GitHub says so, when its GitHub copy is open here', async () => {
    const folder = checkoutHere();
    const pin = { projectId: 'p-shop-here', name: 'shop-here', kind: 'folder', source: folder, branch: 'my-own-work', commit: null };
    const id = release(pin);
    await feed(SCOPE, { ...deps(), checkPin: async () => null, planProject: async (_db, { project }) => (String(project).toLowerCase() === REPO ? CLOUD : null) });
    const [arm] = shown(id).arms;
    expect(arm.status).toBe('blocked');
    expect(arm.why).toMatch(/^This fix was set up before fixes moved to GitHub branches/);
    expect(arm.fix).toMatch(/See who gets what/);
  });
});

describe('after review of the first version', () => {
  test('during a fix, work is never handed to someone else, now or later, nor to an outside tool', async () => {
    const { codeJobRefusal, runInJobProject } = await import('../server/tools/jobProject.js');
    const during = (tool) => runInJobProject({ agentId: 'atlas', project: 'p-cloud', confined: true }, () => codeJobRefusal('atlas', tool));
    for (const tool of ['create_sub_agent', 'submit_agent_task', 'start_helper', 'dispatch_squad', 'request_agent_help', 'hand_off_jobs', 'jules_submit', 'wake_me_up']) {
      expect([tool, during(tool)]).toEqual([tool, expect.stringMatching(/During a fix, do the change yourself on the fix branch/)]);
    }
    expect(during('mcp__files__write_file')).toMatch(/^Error: Blocked/);
    expect(runInJobProject({ agentId: 'atlas', project: 'p-cloud' }, () => codeJobRefusal('atlas', 'create_sub_agent'))).toBeNull();
  });

  test('fixes waiting for checks are picked up at start, with no window open', () => {
    const boot = fs.readFileSync(new URL('../server/boot/lifecycle.js', import.meta.url), 'utf8');
    expect(boot).toMatch(/feedEveryone\(\)[\s\S]{0,200}plans\.recoverOnce\(\)/);
  });

  test('two servers see the checks: only the one that moves the job on carries it on', async () => {
    github.defaultChecks = 'running';
    const id = release(PIN);
    await runToWait(id);
    const { planId } = requests.get(id).arms[0];
    // Another server reads the same checks at the same moment, and saves first: it sent the work back.
    github.defaultChecks = 'failure';
    const plain = global.fetch;
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).includes('/check-runs')) plansDb.row(planId).jobs[0].status = 'sendback';
      return plain(url, options);
    });
    await lookAtParked();
    await planSettled(planId);
    expect(turns).toHaveLength(1);
    expect(plansDb.row(planId).jobs[0].status).toBe('sendback');
  });

  test('a stop while the checks are read: the plan stays stopped, and nothing carries it on', async () => {
    github.defaultChecks = 'running';
    const id = release(PIN);
    await runToWait(id);
    const { planId } = requests.get(id).arms[0];
    github.defaultChecks = 'failure';
    const { stopPlan } = await import('../server/censaiOrchestrator/runner.js');
    const reading = lookAtParked();
    await stopPlan({ id: planId, ...SCOPE }, planDeps());
    await reading;
    await planSettled(planId);
    expect(plansDb.row(planId).status).toBe('stopped');
    expect(turns).toHaveLength(1);
  });

  test('Censai reads the two new job states in plain words', async () => {
    const { planText } = await import('../server/tools/handlers/censaiOrchestrator.js');
    const plan = (status) => ({ id: 'p1', status: 'running', goal: 'Fix the price', jobs: [{ n: 1, agent: 'Atlas', title: 'Fix it', status, checklist: [], steps: [] }] });
    expect(planText(plan('waiting_checks'))).toContain('waiting for the pull request\'s checks');
    expect(planText(plan('sendback'))).toContain('sent back to fix what the checks found');
  });
});

describe('two servers on one database', () => {
  test('a look that is not final never puts back a fix another server already moved on', async () => {
    github.defaultChecks = 'running';
    const id = release(PIN);
    await runToWait(id);
    const { planId } = requests.get(id).arms[0];
    // The other server settles it while this one is still reading the checks.
    const plain = global.fetch;
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).includes('/check-runs')) plansDb.row(planId).jobs[0].status = 'done';
      return plain(url, options);
    });
    await lookAtParked();
    expect(plansDb.row(planId).jobs[0].status).toBe('done');
    expect(isParked(planId)).toBe(false);
  });

  test('a plan another server stopped after this one loaded it starts no turn', async () => {
    const id = release(PIN);
    const stoppedElsewhere = planDeps();
    const send = stoppedElsewhere.sendMail;
    stoppedElsewhere.sendMail = jest.fn(async (...args) => {
      for (const row of plansDb.plans.values()) row.status = 'stopped';
      return send(...args);
    });
    await feed(SCOPE, { ...deps(), planDeps: stoppedElsewhere });
    await settled(id);
    expect(turns).toHaveLength(0);
    expect([...plansDb.plans.values()].map((row) => row.status)).toEqual(['stopped']);
  });
});
