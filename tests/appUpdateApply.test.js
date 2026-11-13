import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { anyoneWorking } from '../server/appUpdate/anyoneWorking.js';
import { activityPost } from '../server/appUpdate/activityPost.js';
import { builtState, idleAnswer, newerBuildReady, repoHead, shouldPutUpdateIn } from '../server/appUpdate/applyWhenIdle.js';
import { bindAppActivity } from '../src/lib/appUpdate/activity.js';
import { INPUT_QUIET_MS, noteAppInput, recentAppInput, resetAppInput } from '../server/appUpdate/inUse.js';

const NEW = 'b'.repeat(40);
const OLD = 'a'.repeat(40);
const SHORT = 'abc1234';
const TEMP = '/tmp/grok-updater-1072';
const quiet = {
  terminals: () => 0,
  consoleAgents: async () => [],
  recentInput: () => false,
};

function makeDir(files = {}) {
  fs.mkdirSync(TEMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEMP, 'apply-'));
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), value);
  return dir;
}

afterAll(() => { fs.rmSync(TEMP, { recursive: true, force: true }); });

describe('a built update goes in only when nobody is working', () => {
  test('an agent mid-task, an open terminal, a console agent, or recent use all count', async () => {
    const busy = await anyoneWorking({ busy: async () => [{ name: 'Atlas', what: 'a task' }], ...quiet });
    expect(busy).toEqual({ working: true, agents: [{ name: 'Atlas', what: 'a task' }] });
    expect(await anyoneWorking({ busy: async () => [], ...quiet })).toEqual({ working: false, agents: [] });
    const terminal = await anyoneWorking({ busy: async () => [], ...quiet, terminals: () => 1 });
    expect(terminal.working).toBe(true);
    const consoleAgent = await anyoneWorking({
      busy: async () => [], ...quiet, consoleAgents: async () => [{ running: true }, { running: false }],
    });
    expect(consoleAgent.working).toBe(true);
    const recent = await anyoneWorking({ busy: async () => [], ...quiet, recentInput: () => true });
    expect(recent.working).toBe(true);
    await expect(anyoneWorking({ busy: async () => { throw new Error('down'); }, ...quiet })).rejects.toThrow('down');
  });

  test('a key or a click in the last 10 minutes counts, and a burst is one report', () => {
    resetAppInput();
    expect(recentAppInput()).toBe(false);
    const now = Date.now();
    noteAppInput(now);
    expect(recentAppInput(now + 1000)).toBe(true);
    expect(recentAppInput(now + INPUT_QUIET_MS)).toBe(false);
    resetAppInput();
    const target = {
      handlers: {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      removeEventListener(name) { delete this.handlers[name]; },
    };
    const sent = [];
    let clock = 1_000;
    const stop = bindAppActivity(target, () => { sent.push(clock); }, { gapMs: 30_000, now: () => clock });
    target.handlers.keydown();
    target.handlers.pointerdown();
    clock = 2_000;
    target.handlers.keydown();
    expect(sent).toEqual([1_000]);
    clock = 31_000;
    target.handlers.pointerdown();
    expect(sent).toEqual([1_000, 31_000]);
    stop();
    expect(target.handlers.keydown).toBeUndefined();
    expect(sent).toEqual([1_000, 31_000]);
  });

  test('a post without the client header does not count as someone using censaiOS', async () => {
    resetAppInput();
    const app = express();
    app.post('/api/app-update/activity', activityPost);
    const refused = await request(app).post('/api/app-update/activity');
    expect(refused.status).toBe(403);
    expect(recentAppInput()).toBe(false);
    const wrong = await request(app).post('/api/app-update/activity').set('X-Censai-Client', '0');
    expect(wrong.status).toBe(403);
    expect(recentAppInput()).toBe(false);
    const ok = await request(app).post('/api/app-update/activity').set('X-Censai-Client', '1');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
    expect(recentAppInput()).toBe(true);
    resetAppInput();
  });

  test('a made build of the code on disk is ready when the running app is older', () => {
    expect(newerBuildReady({ running: OLD, built: NEW, head: NEW })).toBe(true);
    expect(newerBuildReady({ running: OLD, built: SHORT, head: SHORT })).toBe(true);
    expect(newerBuildReady({ running: NEW, built: NEW, head: NEW })).toBe(false);
    expect(newerBuildReady({ running: OLD, built: NEW, head: SHORT })).toBe(false);
    expect(newerBuildReady({ running: OLD, built: 'not-a-commit', head: 'not-a-commit' })).toBe(false);
    expect(newerBuildReady({ running: OLD, built: NEW.toUpperCase(), head: NEW.toUpperCase() })).toBe(false);
    expect(newerBuildReady({ running: OLD, built: NEW, head: '' })).toBe(false);
  });

  test('working has to be exactly false', () => {
    expect(shouldPutUpdateIn({ running: OLD, built: NEW, head: NEW, working: false })).toBe(true);
    expect(shouldPutUpdateIn({ running: OLD, built: NEW, head: NEW, working: true })).toBe(false);
    expect(shouldPutUpdateIn({ running: OLD, built: NEW, head: NEW })).toBe(false);
  });

  test('the notes ignore a BOM, and a missing folder is not a build', () => {
    const dir = makeDir({ 'running.txt': `\uFEFF${OLD}\r\n`, 'built.txt': `\uFEFF${NEW}\n` });
    expect(builtState(dir, NEW)).toEqual({ running: OLD, built: NEW, head: NEW });
    expect(builtState(null, NEW)).toEqual({ running: '', built: '', head: NEW });
  });

  test('the idle answer puts the build in only when it is ready and nobody is working', async () => {
    const dir = makeDir({ 'running.txt': OLD, 'built.txt': NEW });
    const headOf = async () => NEW;
    const free = await idleAnswer({ dir, repo: '/repo', busy: async () => [], headOf, ...quiet });
    expect(free).toEqual({ working: false, ready: true, putIn: true });
    const busy = await idleAnswer({ dir, repo: '/repo', busy: async () => [{ name: 'Nexus' }], headOf, ...quiet });
    expect(busy).toEqual({ working: true, ready: true, putIn: false });
  });

  test('a failed check or an unreadable commit leaves the build where it is', async () => {
    const dir = makeDir({ 'running.txt': OLD, 'built.txt': NEW });
    const failed = await idleAnswer({
      dir, repo: '/repo', busy: async () => { throw new Error('down'); }, headOf: async () => NEW, ...quiet,
    });
    expect(failed).toEqual({ working: true, ready: true, putIn: false });
    const terminal = await idleAnswer({
      dir, repo: '/repo', busy: async () => [], headOf: async () => NEW, ...quiet, terminals: () => 2,
    });
    expect(terminal).toEqual({ working: true, ready: true, putIn: false });
    const noHead = await idleAnswer({
      dir, repo: '/repo', busy: async () => [], headOf: async () => { throw new Error('git'); }, ...quiet,
    });
    expect(noHead).toEqual({ working: false, ready: false, putIn: false });
    const notBuilt = await idleAnswer({
      dir, repo: '/repo', busy: async () => [], headOf: async () => SHORT, ...quiet,
    });
    expect(notBuilt.putIn).toBe(false);
    expect(notBuilt.ready).toBe(false);
  });

  test('repoHead reads the commit, and a git failure is no commit', async () => {
    const head = await repoHead('/repo', { exec: (_cmd, _args, _opts, done) => done(null, `${SHORT}\n`) });
    expect(head).toBe(SHORT);
    const miss = await repoHead('/repo', { exec: (_cmd, _args, _opts, done) => done(new Error('no')) });
    expect(miss).toBe('');
    const exec = () => { throw new Error('should not run'); };
    expect(await repoHead('', { exec })).toBe('');
  });
});
