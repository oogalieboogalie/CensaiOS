import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakePlanDb } from './support/censaiPlanDb.js';

// The parts a project pin is made of (server/censaiOrchestrator/projectPin.js): reading a
// folder's branch, checking a pin again, one plan for each task id, a job that will not run
// in a project that moved, and GitHub reads at the pinned commit. Made-up person: Pat (user 7).

const getFile = jest.fn(async () => 'the file at that commit');
jest.unstable_mockModule('../server/github.js', () => ({ getFile }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));

const { folderHead } = await import('../server/censaiOrchestrator/folderRepo.js');
const { checkPin, pinOf, readPin, resolvePin } = await import('../server/censaiOrchestrator/projectPin.js');
const { insertPlan } = await import('../server/censaiOrchestrator/store.js');
const { runJob } = await import('../server/censaiOrchestrator/job.js');
const { runInJobProject } = await import('../server/tools/jobProject.js');
const { projectRead } = await import('../server/workspaces/read.js');

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
let temp;
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-pin-')); });
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('the branch and commit a project folder is on', () => {
  test('a plain checkout, with the branch file or only the packed list', async () => {
    write(path.join(temp, 'shop', '.git', 'HEAD'), 'ref: refs/heads/feature/login\n');
    write(path.join(temp, 'shop', '.git', 'refs', 'heads', 'feature', 'login'), `${A}\n`);
    expect(await folderHead(path.join(temp, 'shop'))).toEqual({ branch: 'feature/login', commit: A });

    write(path.join(temp, 'packed', '.git', 'HEAD'), 'ref: refs/heads/main\n');
    write(path.join(temp, 'packed', '.git', 'packed-refs'), `# pack-refs with: peeled\n${A} refs/heads/other\n${B} refs/heads/main\n`);
    expect(await folderHead(path.join(temp, 'packed'))).toEqual({ branch: 'main', commit: B });
  });

  test('a second working folder of the same checkout has its own branch', async () => {
    const main = path.join(temp, 'shop', '.git');
    write(path.join(main, 'HEAD'), 'ref: refs/heads/main\n');
    write(path.join(main, 'refs', 'heads', 'main'), `${A}\n`);
    write(path.join(main, 'refs', 'heads', 'side'), `${B}\n`);
    write(path.join(main, 'worktrees', 'side', 'HEAD'), 'ref: refs/heads/side\n');
    write(path.join(main, 'worktrees', 'side', 'commondir'), '../..\n');
    write(path.join(temp, 'shop-side', '.git'), `gitdir: ${path.join(main, 'worktrees', 'side')}\n`);
    expect(await folderHead(path.join(temp, 'shop-side'))).toEqual({ branch: 'side', commit: B });
  });

  test('parked on a bare commit, or not a checkout at all: said as not known', async () => {
    write(path.join(temp, 'parked', '.git', 'HEAD'), `${A}\n`);
    write(path.join(temp, 'plain', 'readme.txt'), 'no git here');
    expect(await folderHead(path.join(temp, 'parked'))).toEqual({ branch: null, commit: A });
    expect(await folderHead(path.join(temp, 'plain'))).toEqual({ branch: null, commit: null });
  });
});

describe('a pin', () => {
  const SHOP = { id: 'p-shop', name: 'Shop', path: 'D:\\Repos\\shop', repo: null };
  const CLOUD = { id: 'p-cloud', name: 'Cloud', path: null, repo: 'acme/shop' };
  const deps = (over = {}) => ({
    reachableProject: async (_db, { id }) => [SHOP, CLOUD].find((row) => row.id === id) || null,
    folderHead: async () => ({ branch: 'main', commit: A }),
    repoHead: async () => ({ branch: 'trunk', commit: B }),
    ...over,
  });
  const PAT = { workspaceId: 'ws-1', userId: 7 };

  test('names the project, where its code is, the branch and the commit', async () => {
    expect(await pinOf(SHOP, deps())).toEqual({ projectId: 'p-shop', name: 'Shop', kind: 'folder', source: 'D:\\Repos\\shop', branch: 'main', commit: A });
    expect(await pinOf(CLOUD, deps())).toEqual({ projectId: 'p-cloud', name: 'Cloud', kind: 'github', source: 'acme/shop', branch: 'trunk', commit: B });
  });

  test('is found the way a hand-off from chat finds its project: a fix keeps the GitHub project, where its pull request goes', async () => {
    const planProject = jest.fn(async (_db, { project }) => (project === 'Shop' ? SHOP : CLOUD));
    expect((await resolvePin({}, PAT, { project: 'acme/shop', tests: true }, deps({ planProject }))).projectId).toBe('p-cloud');
    expect((await resolvePin({}, PAT, { project: 'acme/shop' }, deps({ planProject }))).projectId).toBe('p-cloud');
    expect(planProject).toHaveBeenCalledWith({}, { workspaceId: 'ws-1', userId: 7, project: 'acme/shop', testsHere: false, keepGithub: true }, expect.anything());
    // A folder here that is a checkout of acme/shop: a fix is pinned to the GitHub project instead, a write-up to the folder.
    const checkout = deps({ planProject, folderRepos: async () => new Set(['acme/shop']) });
    expect((await resolvePin({}, PAT, { project: 'Shop', tests: true }, checkout)).projectId).toBe('p-cloud');
    expect((await resolvePin({}, PAT, { project: 'Shop' }, checkout)).projectId).toBe('p-shop');
    // No GitHub copy, or one this person cannot use here: the folder stays, and its arm says why it is blocked (handOut.js).
    expect((await resolvePin({}, PAT, { project: 'Shop', tests: true }, deps({ planProject, folderRepos: async () => new Set() }))).projectId).toBe('p-shop');
    const unreachable = async (_db, { project }) => (project === 'Shop' ? SHOP : null);
    expect((await resolvePin({}, PAT, { project: 'Shop', tests: true }, { ...checkout, planProject: unreachable })).projectId).toBe('p-shop');
    expect(await resolvePin({}, PAT, { project: 'nothing' }, deps({ planProject: async () => null }))).toBeNull();
    // The repo is looked up as the folder's remote spells it, since a lookup compares it exactly.
    const MIXED = { ...CLOUD, repo: 'Acme/Shop' };
    const exact = async (_db, { project }) => (project === 'Shop' ? SHOP : project === 'Acme/Shop' ? MIXED : null);
    const asSpelled = async (_path, { keepCase } = {}) => new Set([keepCase ? 'Acme/Shop' : 'acme/shop']);
    expect((await resolvePin({}, PAT, { project: 'Shop', tests: true }, deps({ planProject: exact, folderRepos: asSpelled }))).source).toBe('Acme/Shop');
  });

  test('holds while nothing changed, and says what changed in plain words when something did', async () => {
    const pin = await pinOf(SHOP, deps());
    expect(await checkPin({}, PAT, pin, deps())).toBeNull();
    expect(await checkPin({}, PAT, { ...pin, source: 'd:/repos/shop/' }, deps())).toBeNull(); // the same folder, written another way
    expect((await checkPin({}, PAT, pin, deps({ reachableProject: async () => ({ ...SHOP, path: 'D:\\Repos\\other' }) }))).why)
      .toBe('The project "Shop" no longer points at the folder D:\\Repos\\shop: it was changed after you looked.');
    expect((await checkPin({}, PAT, pin, deps({ reachableProject: async () => ({ ...SHOP, repo: 'acme/shop' }) }))).why).toMatch(/no longer points at/);
    expect((await checkPin({}, PAT, pin, deps({ reachableProject: async () => null }))).why).toBe('The project "Shop" is no longer open to you on this board.'); // gone, or closed: the same words
    const moved = await checkPin({}, PAT, pin, deps({ folderHead: async () => ({ branch: 'next', commit: B }) }));
    expect(moved.why).toBe('The folder of "Shop" is on the branch "next" now. You looked at it on "main".');
    expect(moved.fix).toMatch(/Switch the folder back to "main"/);
    // A new commit on the same branch is the same pinned place.
    expect(await checkPin({}, PAT, pin, deps({ folderHead: async () => ({ branch: 'main', commit: B }) }))).toBeNull();
  });

  test('one sent back by a browser is cut to size, and anything that is not a pin is dropped', () => {
    expect(readPin({ projectId: 'p-shop', name: 'Shop', kind: 'folder', source: 'D:\\Repos\\shop', branch: 'main', commit: A, extra: 'x' }))
      .toEqual({ projectId: 'p-shop', name: 'Shop', kind: 'folder', source: 'D:\\Repos\\shop', branch: 'main', commit: A });
    for (const bad of [null, 'p-shop', {}, { projectId: 'p-shop', kind: 'folder' }, { projectId: 'p-shop', source: 'x', kind: 'elsewhere' }, { projectId: { id: 1 }, source: 'x', kind: 'folder' }]) {
      expect(readPin(bad)).toBeNull();
    }
  });
});

describe('one plan for each task id', () => {
  const PLAN = { workspaceId: 'ws-1', userId: 7, goal: 'Kraken P0: Checkout crashes', project: 'p-shop', jobs: [{ n: 1 }] };
  const TASK = '0f0e0d0c-0b0a-4908-8706-050403020100';

  test('making a plan again under the same task id gives back the first one, with its pin', async () => {
    const db = fakePlanDb();
    const first = await insertPlan(db, { ...PLAN, id: TASK, pin: { projectId: 'p-shop', branch: 'main' } });
    const again = await insertPlan(db, { ...PLAN, id: TASK, goal: 'A second try' });
    expect([first.id, again.id, again.goal]).toEqual([TASK, TASK, 'Kraken P0: Checkout crashes']);
    expect(again.pin).toEqual({ projectId: 'p-shop', branch: 'main' });
    expect(db.plans.size).toBe(1);
  });

  test('a task id that is someone else\'s plan is refused', async () => {
    const db = fakePlanDb();
    await insertPlan(db, { ...PLAN, id: TASK });
    await expect(insertPlan(db, { ...PLAN, userId: 9, id: TASK })).rejects.toThrow('already in use');
  });
});

describe('a job in a pinned plan', () => {
  test('does not start when the project is no longer the one that was looked at', async () => {
    const job = { n: 1, agentId: 'atlas', title: 'Fix the crash', task: 'Fix it.', status: 'waiting', steps: [], seen: [], checklist: [{ n: 1, text: 'It is fixed', how: 'review', state: 'open' }] };
    const plan = { id: 'plan-1', workspaceId: 'ws-1', userId: 7, goal: 'g', project: 'p-shop', pin: { projectId: 'p-shop', name: 'Shop', kind: 'folder', source: 'D:\\Repos\\shop', branch: 'main' }, jobs: [job] };
    const deps = {
      checkPin: jest.fn(async () => ({ why: 'The folder of "Shop" is on the branch "next" now. You looked at it on "main".' })),
      runAgent: jest.fn(), sendMail: jest.fn(), markRead: jest.fn(), now: () => 0,
    };
    const outcome = await runJob({ entry: { stopped: false, controller: new AbortController() }, plan, job, deps, save: async () => {}, censai: async () => ({}) });
    expect(outcome).toBe('stuck');
    expect(job.error).toBe('The folder of "Shop" is on the branch "next" now. You looked at it on "main".');
    expect(job.checklist.every((item) => item.state !== 'open')).toBe(true);
    expect(deps.checkPin).toHaveBeenCalledWith(undefined, { workspaceId: 'ws-1', userId: 7 }, plan.pin);
    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  test('on a GitHub project, reads the file at the pinned commit; outside the job, and in other projects, nothing changes', async () => {
    const cloud = { id: 'p-cloud', name: 'Cloud', repo: 'acme/shop' };
    await runInJobProject({ agentId: 'atlas', project: 'p-cloud', ref: B }, async () => {
      await projectRead(cloud, 'src/cart.js');
      await projectRead({ id: 'p-else', name: 'Else', repo: 'acme/else' }, 'readme.md');
      await projectRead(cloud, 'src/cart.js', { branch: 'atlas-work' });
    });
    await projectRead(cloud, 'src/cart.js');
    expect(getFile.mock.calls).toEqual([
      ['acme/shop', 'src/cart.js', B],
      ['acme/else', 'readme.md', undefined],
      ['acme/shop', 'src/cart.js', 'atlas-work'],
      ['acme/shop', 'src/cart.js', undefined],
    ]);
  });
});
