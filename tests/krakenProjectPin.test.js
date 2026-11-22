import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A Kraken Request works in the project the person LOOKED at, whatever happens after.
// Through a real request to the real route, feeder and pin (server/routes/agents/krakenRequests.js,
// server/kraken, server/censaiOrchestrator/projectPin.js). Made-up person: Pat (user 1) on the
// Testco board. The projects are real folders in a temp folder, each a small git checkout.
// Stand-ins: the database, the board's project lookup, and the plan runner, whose "worker"
// reads a file in the plan's project the way a project tool would (by id, else by name).

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({ isSessionAuthorized: (session) => Boolean(session?.userId) }));
let role = 'owner';
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async (_db, { workspaceId }) => ({ id: workspaceId, role })),
  requireWorkspaceMember: jest.fn(async () => ({ role: 'owner' })),
}));

// The board: its projects in the order a name finds them, and the ids Pat may use here.
const board = { projects: [], open: new Set() };
const byId = (id) => board.projects.find((row) => row.id === id) || null;
const find = (name) => byId(name) || board.projects.find((row) => row.name.toLowerCase() === String(name).toLowerCase()) || null;
const reach = (row) => (row && board.open.has(row.id) ? row : null);
jest.unstable_mockModule('../server/censaiOrchestrator/planProject.js', () => ({
  planProject: jest.fn(async (_db, { project }) => (project ? reach(find(project)) : null)),
  reachableProject: jest.fn(async (_db, { id }) => reach(byId(id))),
}));
const GITHUB_COMMIT = 'c'.repeat(40);
jest.unstable_mockModule('../server/tools/helpers.js', () => ({
  fetchGithub: jest.fn(async (url) => (url.includes('/commits/') ? { sha: GITHUB_COMMIT } : { default_branch: 'main' })),
}));

const rows = new Map();
const mine = ({ workspaceId, userId }) => [...rows.values()].filter((row) => row.workspace_id === workspaceId && row.user_id === userId);
let nextRequest = 0;
jest.unstable_mockModule('../server/kraken/store.js', () => ({
  insertRequest: jest.fn(async (_db, input) => {
    nextRequest += 1;
    const row = {
      id: `0f0e0d0c-0b0a-4908-8706-0504030201${String(nextRequest).padStart(2, '0')}`, workspace_id: input.workspaceId, user_id: input.userId,
      title: input.title, project: input.project, pin: input.pin, mode: input.mode, status: 'open', arms: structuredClone(input.arms),
      created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
    };
    rows.set(row.id, row);
    return row;
  }),
  getRequest: jest.fn(async (_db, { id, ...who }) => mine(who).find((row) => row.id === id) || null),
  listRequests: jest.fn(async (_db, who) => mine(who)),
  listOpenRequests: jest.fn(async (_db, who) => mine(who).filter((row) => row.status === 'open')),
  listOpenOwners: jest.fn(async () => []),
  saveRequest: jest.fn(async (_db, { id, status, arms }) => {
    const row = rows.get(id);
    if (!row || row.status !== 'open') return null;
    Object.assign(row, { status, arms: structuredClone(arms) });
    return row;
  }),
}));

// The plan runner. Its worker reads WORKER_FILE in the plan's project as soon as the plan is made.
const WORKER_FILE = 'only-here.txt';
const plans = new Map();
function workerRead(project) {
  const row = find(project);
  try {
    return fs.readFileSync(path.join(row.path, WORKER_FILE), 'utf8');
  } catch {
    return null; // not in that project
  }
}
jest.unstable_mockModule('../server/censaiOrchestrator/runner.js', () => ({
  createPlan: jest.fn(async (input) => {
    const id = input.id || `plan-${plans.size + 1}`;
    if (!plans.has(id)) {
      plans.set(id, { id, status: 'running', summary: null, project: input.project, pin: input.pin, kind: input.jobs[0].kind, read: workerRead(input.project) });
    }
    return plans.get(id);
  }),
  stopPlan: jest.fn(async ({ id }) => {
    const plan = plans.get(id);
    if (plan?.status === 'running') plan.status = 'stopped';
    return plan || null;
  }),
  recoverOnce: jest.fn(async () => {}),
  onPlanSettled: jest.fn(),
}));
jest.unstable_mockModule('../server/censaiOrchestrator/store.js', () => ({
  MAX_OPEN_PLANS: 3,
  countOpenPlans: jest.fn(async () => [...plans.values()].filter((plan) => plan.status === 'running').length),
  getPlan: jest.fn(async (_db, { id }) => plans.get(id) || null),
  loadPlan: jest.fn(async () => null),
}));
const handOffGap = jest.fn(async () => null);
jest.unstable_mockModule('../server/tools/handlers/censaiOrchestrator.js', () => ({ handOffGap }));
// What the key a fix would use may do in its GitHub repo (server/github/access.js; tests/krakenFixToPr.test.js runs the real one).
const NO_BRANCH = 'In acme/shop, the saved GitHub sign-in can read, but cannot make a branch or open a pull request: this GitHub account has read access only.';
const checkGithubAccess = jest.fn(async () => ({ ok: true, reason: '' }));
jest.unstable_mockModule('../server/github/access.js', () => ({ checkGithubAccess }));

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { krakenRouter } = await import('../server/routes/agents/krakenRequests.js');
const { createPlan } = await import('../server/censaiOrchestrator/runner.js');
const { insertRequest, saveRequest } = await import('../server/kraken/store.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { userId: 1 };
  next();
});
app.use('/api', requireAuthorizedSession, krakenRouter);

const WS = 'ws-testco';
const REPORT = '# Review of the Testco shop\n- P0 - The api route has no timeout on the server';
const THREE = `${REPORT}\n- P1 - The api server leaks sessions\n- P2 - The api routes have no auth check`;
const post = (url, body) => request(app).post(url).send({ workspaceId: WS, ...body });
const look = (body) => post('/api/kraken/preview', body);
const release = (body) => post('/api/kraken/requests', body);
const requestsNow = async () => (await request(app).get(`/api/kraken/requests?workspaceId=${WS}`)).body.requests;

let temp;
const COMMIT = 'a'.repeat(40);
/** A project folder that is a git checkout on `branch`, holding the worker's file with `text`. */
function folder(name, text, branch = 'main') {
  const dir = path.join(temp, name);
  fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`);
  fs.writeFileSync(path.join(dir, '.git', 'refs', 'heads', branch), `${COMMIT}\n`);
  if (text) fs.writeFileSync(path.join(dir, WORKER_FILE), text);
  return dir;
}
function open(row) {
  board.projects.push(row);
  board.open.add(row.id);
  return row;
}

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kraken-pin-'));
  board.projects = [];
  board.open = new Set();
  rows.clear();
  plans.clear();
  role = 'owner';
  jest.clearAllMocks();
  handOffGap.mockResolvedValue(null);
  checkGithubAccess.mockResolvedValue({ ok: true, reason: '' });
});
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('a Kraken Request works in the project that was looked at', () => {
  for (const mode of ['fix', 'writeup']) {
    test(`${mode}: look with Alpha, switch to Beta, release: the worker reads Alpha's file`, async () => {
      const alpha = open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'only Alpha has this') });
      open({ id: 'p-beta', name: 'Beta', path: folder('beta', null, 'next') });

      const seen = await look({ report: REPORT, mode, project: 'Alpha' });
      expect(seen.status).toBe(200);
      expect(seen.body.pin).toEqual({ projectId: 'p-alpha', name: 'Alpha', kind: 'folder', source: alpha.path, branch: 'main', commit: COMMIT });

      // The window's project is Beta by now. The pin from the look goes back as it came.
      const out = await release({ report: REPORT, mode, project: 'Beta', projectId: 'p-beta', pin: seen.body.pin });
      expect(out.status).toBe(201);
      expect(out.body.request.pin.projectId).toBe('p-alpha');
      if (mode === 'fix') {
        // A fix ends in a pull request and is never written into this folder, which has no GitHub copy.
        const [arm] = out.body.request.arms;
        expect([arm.status, arm.kind]).toEqual(['blocked', 'code']);
        expect(arm.why).toMatch(/^The project "Alpha" is a folder on this computer, and this folder has no GitHub copy to open a pull request on\./);
        expect(plans.size).toBe(0);
        return;
      }
      expect(out.body.request.arms.map((arm) => [arm.status, arm.kind])).toEqual([['handed', 'answer']]);
      const [plan] = [...plans.values()];
      expect(plan.read).toBe('only Alpha has this');
      expect([plan.project, plan.pin.projectId, plan.pin.branch]).toEqual(['p-alpha', 'p-alpha', 'main']);
    });
  }

  test('fix on GitHub: look with Alpha, switch to Beta, release: the fix works in Alpha', async () => {
    open({ id: 'p-alpha', name: 'Alpha', repo: 'acme/alpha', path: null });
    open({ id: 'p-beta', name: 'Beta', repo: 'acme/beta', path: null });
    const seen = await look({ report: REPORT, mode: 'fix', project: 'Alpha' });
    expect(seen.body.pin).toEqual({ projectId: 'p-alpha', name: 'Alpha', kind: 'github', source: 'acme/alpha', branch: 'main', commit: GITHUB_COMMIT });
    const out = await release({ report: REPORT, mode: 'fix', project: 'Beta', projectId: 'p-beta', pin: seen.body.pin });
    expect(out.status).toBe(201);
    expect(out.body.request.arms.map((arm) => [arm.status, arm.kind])).toEqual([['handed', 'code']]);
    const [plan] = [...plans.values()];
    expect([plan.project, plan.pin.projectId, plan.pin.source, plan.kind]).toEqual(['p-alpha', 'p-alpha', 'acme/alpha', 'code']);
  });

  test('two projects with the same name: the pin is the one that was looked at', async () => {
    open({ id: 'p-old', name: 'Shop', repo: 'acme/shop-old', path: null });
    open({ id: 'p-new', name: 'Shop', repo: 'acme/shop-new', path: null });
    // By name alone the older one is found; the window sends the id of the one it shows.
    expect((await look({ report: REPORT, project: 'Shop' })).body.pin.projectId).toBe('p-old');
    const seen = await look({ report: REPORT, mode: 'fix', project: 'Shop', projectId: 'p-new' });
    expect(seen.body.pin).toEqual(expect.objectContaining({ projectId: 'p-new', source: 'acme/shop-new' }));
    const out = await release({ report: REPORT, mode: 'fix', project: 'Shop', pin: seen.body.pin });
    expect(out.status).toBe(201);
    expect([...plans.values()].map((plan) => [plan.project, plan.kind])).toEqual([['p-new', 'code']]);
  });

  test('a pin that no longer names the same project is refused in plain words, and nothing goes out', async () => {
    const alpha = open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'only Alpha has this') });
    const beta = folder('beta', 'Beta');
    const { pin } = (await look({ report: REPORT, mode: 'fix', project: 'Alpha' })).body;

    alpha.path = beta; // the id now points at other code
    const moved = await release({ report: REPORT, mode: 'fix', pin });
    alpha.path = pin.source;
    board.open.delete('p-alpha'); // Pat may no longer use it here
    const shut = await release({ report: REPORT, mode: 'fix', pin });
    board.open.add('p-alpha');
    fs.writeFileSync(path.join(pin.source, '.git', 'HEAD'), 'ref: refs/heads/other\n'); // the folder changed branch
    const branch = await release({ report: REPORT, mode: 'fix', pin });
    const noPin = await release({ report: REPORT, mode: 'fix', project: 'Alpha' });

    expect([moved.status, shut.status, branch.status, noPin.status]).toEqual([409, 409, 409, 409]);
    expect(moved.body.error).toMatch(/"Alpha" no longer points at the folder .* Nothing was handed out/);
    expect(shut.body.error).toMatch(/The project "Alpha" is no longer open to you on this board/);
    expect(branch.body.error).toMatch(/is on the branch "other" now\. You looked at it on "main"/);
    expect(noPin.body.error).toMatch(/See who gets what/);
    expect(insertRequest).not.toHaveBeenCalled();
    expect(plans.size).toBe(0);
  });

  test('a fix in a project nobody has here is refused at the look', async () => {
    const res = await look({ report: REPORT, mode: 'fix', project: 'Gamma' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No project called "Gamma" is open to you on this board/);
  });

  test('a write-up whose project is not found still gets its look and goes out, with no project, and says so', async () => {
    const seen = await look({ report: REPORT, project: 'Gamma', projectId: 'p-gamma' });
    expect(seen.status).toBe(200);
    expect(seen.body.pin).toBeNull();
    expect(seen.body.pinNote).toMatch(/^No project called "Gamma" is open to you on this board, so this write-up will go out with no project/);
    expect(seen.body.arms).toHaveLength(1);
    const out = await release({ report: REPORT, project: 'Gamma', projectId: 'p-gamma', pin: seen.body.pin });
    expect(out.status).toBe(201);
    expect([...plans.values()].map((plan) => [plan.project, plan.pin])).toEqual([[null, null]]);
  });

  test('someone who can only look sees who would get what, but nothing about any project', async () => {
    const alpha = open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'only Alpha has this') });
    open({ id: 'p-cloud', name: 'Cloud', repo: 'acme/shop', path: null });
    const { planProject } = await import('../server/censaiOrchestrator/planProject.js');
    const { fetchGithub } = await import('../server/tools/helpers.js');
    role = 'viewer';
    for (const body of [{ project: 'Alpha' }, { project: 'Cloud' }, { project: 'Gamma' }, { mode: 'fix', projectId: 'p-alpha' }, {}]) {
      const seen = await look({ report: REPORT, ...body });
      expect(seen.status).toBe(200);
      expect(seen.body.arms).toHaveLength(1);
      expect([seen.body.pin, seen.body.project]).toEqual([null, null]);
      expect(seen.body.pinNote).toBe('Which project the work would run in is shown only to people who can start work on this board.');
      expect(JSON.stringify(seen.body)).not.toContain(path.basename(alpha.path));
    }
    expect(planProject).not.toHaveBeenCalled();
    expect(fetchGithub).not.toHaveBeenCalled();
  });
});

describe('a fix that cannot go out stays a fix, and says why', () => {
  const ON_GITHUB = 'Error: The project "p-cloud" lives on GitHub, so I can\'t run its tests on this computer. Job 1 needs the project\'s tests, so it could never be checked off. Hand out jobs that look into it and write up what to change instead, and tell the person why.';

  test('a project that is only on GitHub goes out as a fix: its pull request\'s checks are its tests', async () => {
    open({ id: 'p-cloud', name: 'Cloud', repo: 'acme/shop', path: null });
    const seen = await look({ report: REPORT, mode: 'fix', project: 'Cloud' });
    expect(seen.body.pin).toEqual({ projectId: 'p-cloud', name: 'Cloud', kind: 'github', source: 'acme/shop', branch: 'main', commit: GITHUB_COMMIT });
    const out = await release({ report: REPORT, mode: 'fix', pin: seen.body.pin });
    expect(out.body.request.arms.map((arm) => [arm.status, arm.kind, arm.why])).toEqual([['handed', 'code', '']]);
    expect(checkGithubAccess).toHaveBeenCalledWith(expect.objectContaining({
      repo: 'acme/shop', ref: GITHUB_COMMIT, userId: 1, needs: ['read', 'branch', 'pull request'],
    }));
  });

  test('a project on GitHub the key may not branch in: blocked with the reason, not a write-up; it goes out once the way is clear', async () => {
    open({ id: 'p-cloud', name: 'Cloud', repo: 'acme/shop', path: null });
    const seen = await look({ report: REPORT, mode: 'fix', project: 'Cloud' });
    checkGithubAccess.mockResolvedValue({ ok: false, reason: NO_BRANCH });

    const out = await release({ report: REPORT, mode: 'fix', pin: seen.body.pin });
    expect(out.status).toBe(201);
    const [arm] = out.body.request.arms;
    expect([arm.status, arm.kind]).toEqual(['blocked', 'code']);
    expect(arm.why).toBe(NO_BRANCH);
    expect(arm.fix).toMatch(/goes out the next time you look/);
    expect(plans.size).toBe(0);

    // Looking again does not finish the request on a blocked arm, and makes no plan.
    const [still] = await requestsNow();
    expect([still.status, still.counts.blocked, still.arms[0].kind]).toEqual(['open', 1, 'code']);
    expect(plans.size).toBe(0);

    checkGithubAccess.mockResolvedValue({ ok: true, reason: '' });
    const [gone] = await requestsNow();
    expect([gone.arms[0].status, gone.arms[0].kind, gone.arms[0].why]).toEqual(['handed', 'code', '']);
    expect([...plans.values()].map((plan) => plan.kind)).toEqual(['code']);
  });

  test('stopping ends a request whose arm is blocked', async () => {
    open({ id: 'p-cloud', name: 'Cloud', repo: 'acme/shop', path: null });
    const { pin } = (await look({ report: REPORT, mode: 'fix', project: 'Cloud' })).body;
    handOffGap.mockResolvedValue(ON_GITHUB);
    const out = await release({ report: REPORT, mode: 'fix', pin });
    const stop = await post(`/api/kraken/requests/${out.body.request.id}/stop`, {});
    expect([stop.body.request.status, stop.body.request.arms[0].status]).toEqual(['stopped', 'stopped']);
    expect(plans.size).toBe(0);
  });

  test('the pinned project goes away while an arm waits: that arm is blocked, fix or write-up', async () => {
    open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'only Alpha has this') });
    const { pin } = (await look({ report: THREE, project: 'Alpha' })).body;
    await release({ report: THREE, pin });
    expect(plans.size).toBe(2); // two at a time; the third waits
    for (const plan of plans.values()) plan.status = 'done';
    board.projects = [];

    const [now] = await requestsNow();
    expect(now.arms.map((arm) => arm.status)).toEqual(['done', 'done', 'blocked']);
    expect(now.arms[2].why).toBe('The project "Alpha" is no longer open to you on this board.');
    expect([now.status, plans.size]).toEqual(['open', 2]);
  });
});

describe('an arm is saved as going out before its plan is made', () => {
  const taskIds = () => [...rows.values()][0].arms.map((arm) => arm.taskId);

  test('every arm has its own task id from the moment the request is made', async () => {
    open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'x') });
    const { pin } = (await look({ report: THREE, project: 'Alpha' })).body;
    await release({ report: THREE, pin });
    expect(new Set(taskIds()).size).toBe(3);
    expect(taskIds().every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect([...plans.keys()]).toEqual(taskIds().slice(0, 2));
  });

  test('a crash before the plan is made: the next look makes exactly one', async () => {
    open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'x') });
    const { pin } = (await look({ report: REPORT, project: 'Alpha' })).body;
    createPlan.mockImplementationOnce(async () => { throw new Error('the server went down'); });
    await release({ report: REPORT, pin });
    expect([...rows.values()][0].arms[0].status).toBe('handing');
    expect(plans.size).toBe(0);

    const [after] = await requestsNow();
    expect(after.arms[0].status).toBe('handed');
    expect([...plans.keys()]).toEqual(taskIds());
    await requestsNow();
    expect(plans.size).toBe(1);
  });

  test('a crash after the plan is made, before its id is saved: the next look finds that plan, and makes no second one', async () => {
    open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'x') });
    const { pin } = (await look({ report: REPORT, project: 'Alpha' })).body;
    const save = saveRequest.getMockImplementation();
    let saves = 0;
    saveRequest.mockImplementation(async (...args) => {
      saves += 1;
      if (saves === 2) throw new Error('the server went down'); // 1: saved as going out. 2: the plan id.
      return save(...args);
    });
    await release({ report: REPORT, pin });
    saveRequest.mockImplementation(save);
    expect([...rows.values()][0].arms[0]).toEqual(expect.objectContaining({ status: 'handing', planId: null }));
    expect(plans.size).toBe(1);

    const [after] = await requestsNow();
    expect([after.arms[0].status, after.arms[0].planId]).toEqual(['handed', taskIds()[0]]);
    expect(plans.size).toBe(1);
    expect(createPlan).toHaveBeenCalledTimes(1);
  });
});

describe('requests from before pins', () => {
  const OLD_ARM = { n: 1, severity: 'P0', title: 'Checkout crashes', agentId: 'atlas', kind: 'answer', task: 'Look into it.', checklist: ['The answer says what to change'], note: '', result: '' };
  const old = (id, extra) => ({
    id, workspace_id: WS, user_id: 1, title: 'An older review', project: 'Alpha', mode: 'writeup',
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...extra,
  });

  test('a finished row with no pin and no task ids still lists', async () => {
    rows.set('old-1', old('old-1', { status: 'done', arms: [{ ...OLD_ARM, status: 'done', planId: 'plan-x', result: 'Written up.' }] }));
    const [shown] = await requestsNow();
    expect(shown).toEqual(expect.objectContaining({ title: 'An older review', project: 'Alpha', pin: null, status: 'done' }));
    expect(shown.arms[0]).toEqual(expect.objectContaining({ status: 'done', result: 'Written up.', why: '', fix: '' }));
  });

  test('an open one still hands its waiting arm out, by the name it was made with', async () => {
    open({ id: 'p-alpha', name: 'Alpha', path: folder('alpha', 'only Alpha has this') });
    rows.set('old-2', old('old-2', { status: 'open', arms: [{ ...OLD_ARM, status: 'waiting', planId: null }] }));
    const [shown] = await requestsNow();
    expect(shown.arms[0].status).toBe('handed');
    expect([...plans.values()].map((plan) => [plan.project, plan.pin])).toEqual([['Alpha', null]]);
  });
});
