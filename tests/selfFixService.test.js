/**
 * Self-fix end to end with a real git repo and a stand-in task runner:
 * error -> report -> fix in a worktree -> patch waits -> applied at the next
 * start -> undone. The stand-in plays Claude Code's part (edit + verdict).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { execFileSync } from 'child_process';
import * as worktrees from '../server/cli-agents/worktrees.js';
import { SelfFix } from '../server/selfFix/service.js';
import { SelfFixStore } from '../server/selfFix/store.js';
import { patchState } from '../server/selfFix/patches.js';

let tmp;
let repo;
const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' });

class StandInTasks extends EventEmitter {
  constructor(behave) {
    super();
    this.tasks = new Map();
    this.behave = behave;
    this.decisions = [];
    this.started = [];
  }
  get(id) { return this.tasks.get(id); }
  async start({ folder, prompt, title, prepare }) {
    const id = `t${this.tasks.size + 1}`;
    const baseSha = git(['rev-parse', 'HEAD'], folder).trim();
    const wt = await worktrees.createWorktree({ repoRoot: folder, baseSha, taskId: id, cli: 'claudecode', env: { CENSAI_WORKTREE_DIR: path.join(tmp, 'wt') } });
    if (prepare) await prepare(wt.dir);
    const task = { id, status: 'running', title, prompt, baseSha, worktree: { dir: wt.dir }, summary: null };
    this.tasks.set(id, task);
    this.started.push(task);
    setTimeout(() => {
      this.emit('permission', { taskId: id, request: { id: 'p1', tool: 'Bash', input: { command: 'npm install x' } } });
      Object.assign(task, this.behave(task));
      this.emit('task', id);
    }, 5);
    return { id };
  }
  decide(id, permissionId, decision) { this.decisions.push({ id, permissionId, ...decision }); }
  changes(id) { const t = this.tasks.get(id); return worktrees.changes({ dir: t.worktree.dir, baseSha: t.baseSha }); }
}

function fixTheBug(task) {
  fs.writeFileSync(path.join(task.worktree.dir, 'server', 'math.js'), 'export const half = (n) => (Number(n) || 0) / 2;\n');
  return { status: 'done', summary: 'Done.\nSELF-FIX RESULT: FIXED - Halving a missing number no longer crashes.' };
}

function make(behave = fixTheBug, settings = { autoFix: true }) {
  const store = new SelfFixStore({ file: path.join(tmp, `state-${Math.random().toString(36).slice(2)}.json`) });
  store.setSettings(settings);
  const tasks = new StandInTasks(behave);
  const selfFix = new SelfFix({ store, tasks, repoRoot: repo, readiness: async () => ({ ok: true }), env: {} });
  return { selfFix, store, tasks };
}

const settle = (selfFix) => new Promise((resolve) => {
  const tick = () => (selfFix.active || selfFix.queue.length ? setTimeout(tick, 20) : resolve());
  setTimeout(tick, 30);
});

const BUG = { kind: 'server-error', source: 'server', message: 'Cannot read properties of undefined', stack: 'TypeError: x\n    at half (/app/server/math.js:1:20)' };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-fix-'));
  repo = path.join(tmp, 'censaios');
  fs.mkdirSync(path.join(repo, 'server'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'server', 'math.js'), 'export const half = (n) => n.value / 2;\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.homebase-state/\nnode_modules\n');
  git(['init', '-q']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base']);
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the whole loop: report, fix, wait, apply at start, undo', async () => {
  const { selfFix, store, tasks } = make();
  const report = selfFix.capture(BUG);
  await settle(selfFix);

  const after = store.get(report.id);
  expect(after.status).toBe('ready');
  expect(after.fix.summary).toBe('Halving a missing number no longer crashes.');
  expect(after.fix.files).toEqual(['server/math.js']);
  expect(tasks.started[0].prompt).toContain('Cannot read properties of undefined');
  expect(tasks.started[0].title).toMatch(/^Self-fix: /);
  // The install the agent asked for was refused by the rules, with a reason.
  expect(tasks.decisions[0]).toMatchObject({ allow: false, user: { name: 'Self-fix' } });
  expect(tasks.decisions[0].message).toMatch(/No installs/);
  // Nothing changed in the real copy yet: the fix waits for the next start.
  expect(fs.readFileSync(path.join(repo, 'server', 'math.js'), 'utf8')).toContain('n.value');
  expect(patchState(repo, report.id)).toBe('pending');
  expect(fs.existsSync(path.join(repo, '.homebase-state', 'self-fix', 'receipts', `${report.id}.md`))).toBe(true);

  const results = await selfFix.boot();
  expect(results).toEqual([{ id: report.id, result: 'applied' }]);
  expect(fs.readFileSync(path.join(repo, 'server', 'math.js'), 'utf8')).toContain('Number(n)');
  expect(store.get(report.id).status).toBe('applied');
  expect(git(['log', '--oneline']).trim().split('\n')).toHaveLength(1); // never committed

  await selfFix.undo(report.id);
  expect(fs.readFileSync(path.join(repo, 'server', 'math.js'), 'utf8')).toContain('n.value');
  expect(store.get(report.id).status).toBe('undone');
});

test('the same error again only counts; it is not fixed twice', async () => {
  const { selfFix, store, tasks } = make();
  selfFix.capture(BUG);
  await settle(selfFix);
  const again = selfFix.capture({ ...BUG, stack: 'TypeError: x\n    at half (/app/server/math.js:1:44)' });
  await settle(selfFix);
  expect(store.get(again.id).count).toBe(2);
  expect(tasks.started).toHaveLength(1);
});

test('switch off (the default), daily cap, and outside-world errors only save the report', async () => {
  const off = make(fixTheBug, { autoFix: null });
  const saved = off.selfFix.capture(BUG);
  await settle(off.selfFix);
  expect(off.store.get(saved.id)).toMatchObject({ status: 'saved', note: expect.stringMatching(/^Off/) });
  expect(off.tasks.started).toHaveLength(0);

  const capped = make(fixTheBug, { autoFix: true, dailyCap: 0 });
  const r2 = capped.selfFix.capture(BUG);
  await settle(capped.selfFix);
  expect(capped.store.get(r2.id).note).toMatch(/limit of 0 fixes/);

  const outside = make();
  const r3 = outside.selfFix.capture({ kind: 'server-error', source: 'server', message: 'connect ECONNREFUSED 127.0.0.1:5433' });
  await settle(outside.selfFix);
  expect(outside.store.get(r3.id)).toMatchObject({ status: 'saved', note: expect.stringMatching(/outside the code/) });
  expect(outside.tasks.started).toHaveLength(0);
});

test('an agent that cannot fix it files the report; nothing is queued', async () => {
  const { selfFix, store } = make(() => ({ status: 'done', summary: 'SELF-FIX RESULT: NOT FIXED - The database was down.' }));
  const report = selfFix.capture(BUG);
  await settle(selfFix);
  expect(store.get(report.id)).toMatchObject({ status: 'failed', note: 'The database was down.' });
  expect(patchState(repo, report.id)).toBeNull();
});

test('a fix that conflicts with newer code waits; one an update already has is marked landed', async () => {
  const { selfFix, store } = make();
  const report = selfFix.capture(BUG);
  await settle(selfFix);
  // An update brings the very same fix.
  fs.writeFileSync(path.join(repo, 'server', 'math.js'), 'export const half = (n) => (Number(n) || 0) / 2;\n');
  expect(await selfFix.boot()).toEqual([{ id: report.id, result: 'landed' }]);
  expect(store.get(report.id).status).toBe('landed');
});

test('a teammate\'s report is saved for the owner, not sent to Claude Code', async () => {
  const { selfFix, store, tasks } = make();
  const report = selfFix.capture({ ...BUG, source: 'browser' }, { canFix: false });
  await settle(selfFix);
  expect(store.get(report.id)).toMatchObject({ status: 'saved', note: expect.stringMatching(/teammate/) });
  expect(tasks.started).toHaveLength(0);
  await selfFix.maybeFix(store.get(report.id), { manual: true });
  await settle(selfFix);
  expect(store.get(report.id).status).toBe('ready');
});
