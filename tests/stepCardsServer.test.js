// Step cards on the server: Censai's translation is read back through the
// .todo rules, and each check is checked for real (files in the project,
// commands only for the owner, a read-over only against a report).
import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { translateCard } from '../server/stepCards/translate.js';
import { checkFile, checkRun, verifyStep } from '../server/stepCards/verify.js';
import { cleanChecks, createStepCardsRouter, whereToCheck } from '../server/routes/stepCards.js';
import { HIDDEN_MARK } from '../shared/files/fileProblems.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-'));
fs.mkdirSync(path.join(tmp, 'src'));
fs.writeFileSync(path.join(tmp, 'src', 'badge.js'), 'export const badge = () => new Date().toLocaleDateString();\n');

describe('translate', () => {
  test('a card already in the .todo shape skips the model', async () => {
    const complete = jest.fn();
    const out = await translateCard('== A card\n-- Step 1: Do it\n[ ] file a.js', { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(out.translated).toBe(false);
    expect(out.cards[0].steps[0].checks).toEqual([{ kind: 'file', path: 'a.js' }]);
  });

  test("Censai's steps are read back and a check it cannot verify is left out", async () => {
    const complete = jest.fn(async () => '```\ncensaiOS to-do file\n== Date badge\nGoal: Shows the date.\n\n-- Step 1: Add the badge\nMake it.\n[ ] file src/badge.js\n[ ] run curl http://example.com\n\n-- Step 2: Prove it\n[ ] run npm test\n```');
    const out = await translateCard('Card 99: add a date badge. Files: src/badge.js. Tests must pass.', { complete });
    expect(complete.mock.calls[0][0][1].content).toContain('Card 99');
    expect(out).toMatchObject({ translated: true, skipped: 1 });
    expect(out.cards[0].steps.map((s) => s.checks)).toEqual([[{ kind: 'file', path: 'src/badge.js' }], [{ kind: 'run', command: 'npm test' }]]);
  });

  test('nothing usable back is a plain error', async () => {
    await expect(translateCard('a card', { complete: async () => 'Sure! Here are some thoughts.' })).rejects.toThrow('could not turn that card into steps');
    await expect(translateCard('  ', { complete: jest.fn() })).rejects.toThrow('Paste a card first.');
  });
});

describe('checks', () => {
  test('files: there, says the words, and never outside the project', async () => {
    expect(await checkFile(tmp, { path: 'src/badge.js' })).toMatchObject({ ok: true });
    expect(await checkFile(tmp, { path: 'src/badge.js', says: 'toLocaleDateString' })).toMatchObject({ ok: true });
    expect(await checkFile(tmp, { path: 'src/badge.js', says: 'toISOString' })).toMatchObject({ ok: false });
    expect(await checkFile(tmp, { path: 'src/missing.js' })).toMatchObject({ ok: false, line: 'src/missing.js is not in the project yet.' });
    expect(await checkFile(tmp, { path: '../outside.txt' })).toMatchObject({ ok: null });
  });

  test('a link that points out of the project is never followed', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'BEGIN SECRET');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(tmp, 'leak'));
    expect(await checkFile(tmp, { path: 'leak', says: 'BEGIN' })).toMatchObject({ ok: null });
    expect(await checkFile(tmp, { path: 'leak' })).toMatchObject({ ok: null });
  });

  test('a file that holds keys is found but never read, even through a link or for the owner', async () => {
    fs.writeFileSync(path.join(tmp, '.env'), 'MADE_UP_KEY=not-a-real-made-up-key\n');
    fs.symlinkSync(path.join(tmp, '.env'), path.join(tmp, 'made-up-link.md'));
    const isOwner = async () => true;
    expect(await checkFile(tmp, { path: '.env' })).toEqual({ ok: true, line: 'Found .env.' });
    for (const p of ['.env', 'made-up-link.md']) {
      expect(await checkFile(tmp, { path: p, says: 'MADE_UP_KEY=n' }, { isOwner })).toEqual({ ok: null, line: `${p} can hold keys or passwords, so I do not read it.` });
    }
  });

  test('a file in a hidden folder is read only for the owner, asked for there or through a link', async () => {
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.git', 'config'), 'url = https://made-up-token@example.invalid/made-up.git\n');
    fs.symlinkSync(path.join(tmp, '.git', 'config'), path.join(tmp, 'made-up-config.md'));
    const isOwner = jest.fn(async () => false);
    for (const p of [path.join('.git', 'config'), 'made-up-config.md']) {
      expect(await checkFile(tmp, { path: p, says: 'made-up-token' }, { isOwner })).toEqual({ ok: null, line: `${p} is in a hidden folder, so only this computer's owner can have me read it.` });
      expect(await checkFile(tmp, { path: p, says: 'made-up-token' }, { isOwner: async () => true })).toMatchObject({ ok: true });
    }
    expect(await checkFile(tmp, { path: path.join('.git', 'config') })).toMatchObject({ ok: true });
    const checks = [{ id: 'a', kind: 'file', path: '.git/config', says: 'url' }, { id: 'b', kind: 'file', path: 'made-up-config.md', says: 'url' }];
    const results = await verifyStep({ step: { title: 's' }, checks, ctx: { cwd: tmp, isOwner } });
    expect(results.map((r) => r.ok)).toEqual([null, null]);
    expect(isOwner).toHaveBeenCalledTimes(3);
  });

  test('picking a hidden folder itself as the folder to check hides nothing', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-hidden-'));
    fs.mkdirSync(path.join(project, '.git'));
    fs.writeFileSync(path.join(project, '.git', 'config'), 'url = https://made-up-token@example.invalid/made-up.git\n');
    const isOwner = async () => false;
    const hidden = { ok: null, line: "config is in a hidden folder, so only this computer's owner can have me read it." };
    expect(await checkFile(path.join(project, '.git'), { path: 'config', says: 'made-up-token' }, { isOwner, root: project })).toEqual(hidden);
    const checks = [{ id: 'a', kind: 'file', path: 'config', says: 'made-up-token' }];
    const results = await verifyStep({ step: { title: 's' }, checks, ctx: { cwd: path.join(project, '.git'), root: project, isOwner } });
    expect(results[0]).toMatchObject(hidden);
    // The open project, or the coding agent's whole worktree, is where hidden folders count from.
    const folders = (task = null) => async () => ({ assertAllowedFolder: async (f) => f, rootOf: async () => project, tasks: { get: () => task } });
    expect(await whereToCheck({ folder: path.join(project, '.git'), folders: folders() })).toMatchObject({ cwd: path.join(project, '.git'), root: project });
    const task = { status: 'done', folder: project, worktree: { cwd: path.join(project, '.git'), dir: project } };
    expect(await whereToCheck({ folder: null, cliTaskId: 'made-up-task', folders: folders(task) })).toMatchObject({ cwd: path.join(project, '.git'), root: project });
  });

  test("a coding agent's report, which the card shows on the shared board, has a key it read in .env as [hidden]", async () => {
    const KEY = 'made-up-key-0123456789';
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-report-'));
    const task = {
      id: 'made-up-task', status: 'done', rev: 1, folder: project, summary: `I added the badge and put ${KEY} in config.js.`, permissions: [],
      worktree: { cwd: project, dir: project }, items: [{ id: 'r', kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}`, rev: 1 }],
    };
    const folders = async () => ({ assertAllowedFolder: async (f) => f, rootOf: async () => project, tasks: { get: () => task } });
    expect(await whereToCheck({ folder: null, cliTaskId: 'made-up-task', folders })).toMatchObject({ report: `I added the badge and put ${HIDDEN_MARK} in config.js.`, worktree: true });
    fs.rmSync(project, { recursive: true, force: true });
  });

  test("a coding agent that changed the project's npm scripts does not get them run", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-project-'));
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'step-cards-worktree-'));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    fs.writeFileSync(path.join(worktree, 'package.json'), JSON.stringify({ scripts: { test: 'node steal-things.js' } }));
    const run = jest.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    expect(await checkRun(worktree, { command: 'npm test' }, { run, trustFrom: project })).toMatchObject({ ok: null });
    expect(run).not.toHaveBeenCalled();
    fs.writeFileSync(path.join(worktree, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    expect(await checkRun(worktree, { command: 'npm test' }, { run, trustFrom: project })).toMatchObject({ ok: true });
    expect(await checkRun(worktree, { command: 'npm test' }, { run: async () => ({ stdout: '' }) })).toMatchObject({ ok: false });
  });

  test('an automatic check never runs a command', async () => {
    const run = jest.fn();
    const results = await verifyStep({ step: { title: 's' }, checks: [{ id: 'r', kind: 'run', command: 'npm test' }], ctx: { cwd: tmp, isOwner: async () => true, skipRuns: true }, deps: { run } });
    expect(results[0].ok).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  test('runs: exit code decides, with a plain environment and only allowed commands', async () => {
    const run = jest.fn(async () => ({ code: 0, stdout: 'Tests:       3 passed, 3 total', stderr: '' }));
    expect(await checkRun(tmp, { command: 'npm test -- tests/a.test.js' }, { run })).toEqual({ ok: true, line: 'npm test -- tests/a.test.js passed (3 tests).' });
    expect(run.mock.calls[0][0]).toBe('npm');
    expect(run.mock.calls[0][1]).toEqual(['test', '--', 'tests/a.test.js']);
    expect(run.mock.calls[0][2].env.OPENAI_API_KEY).toBeUndefined();
    const failing = jest.fn(async () => ({ code: 1, stdout: 'Tests:       1 failed, 3 total', stderr: '' }));
    expect(await checkRun(tmp, { command: 'npm test' }, { run: failing })).toMatchObject({ ok: false });
    expect(await checkRun(tmp, { command: 'npm exec evil' }, { run })).toMatchObject({ ok: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  const step = { title: 'Add the badge', text: '' };
  const checks = [
    { id: 'f', kind: 'file', path: 'src/badge.js' },
    { id: 'r', kind: 'run', command: 'npm test' },
    { id: 'a', kind: 'ask', statement: 'The badge shows the date' },
  ];

  test('a teammate who is not the owner never runs a command, and no report means nothing to read', async () => {
    const complete = jest.fn();
    const results = await verifyStep({ step, checks, ctx: { cwd: tmp, report: '', isOwner: async () => false, complete } });
    expect(results.map((r) => r.ok)).toEqual([true, null, null]);
    expect(results[1].line).toContain("Only this computer's owner");
    expect(complete).not.toHaveBeenCalled();
  });

  test("Censai's read-over: PASS turns it green, FAIL does not, and it sees what the other checks found", async () => {
    const run = jest.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    const complete = jest.fn(async () => '1. PASS The report says the badge shows the date.');
    const results = await verifyStep({ step, checks, ctx: { cwd: tmp, report: 'I added the badge.', isOwner: async () => true, complete }, deps: { run } });
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(complete.mock.calls[0][0][1].content).toContain('Found src/badge.js.');
    const fail = await verifyStep({ step, checks: [checks[2]], ctx: { cwd: tmp, report: 'Will do it later.', isOwner: async () => true, complete: async () => '1. FAIL It is not done.' } });
    expect(fail).toEqual([{ id: 'a', ok: false, line: 'It is not done.' }]);
  });

  test('no project open: nothing is green and it says why', async () => {
    const results = await verifyStep({ step, checks: [checks[0]], ctx: { cwd: null, noFolder: 'Open the project first.', isOwner: async () => true } });
    expect(results).toEqual([{ id: 'f', ok: null, line: 'Open the project first.' }]);
  });
});

describe('route', () => {
  function app({ session = { userId: 3 }, owner = false, task = null } = {}) {
    const instance = express();
    instance.use(express.json());
    instance.use((req, _res, next) => { req.session = session; next(); });
    const folders = async () => ({
      assertAllowedFolder: async (f) => { if (f !== tmp) throw new Error('not open'); return f; },
      tasks: { get: (id) => { if (!task || id !== task.id) throw new Error('gone'); return task; } },
    });
    const completer = async () => async () => '1. PASS Done.';
    instance.use('/api/step-cards', createStepCardsRouter({ completer, folders, isOwner: async () => { if (!owner) throw new Error('no'); } }));
    return instance;
  }

  test('signed out gets a 401', async () => {
    expect((await request(app({ session: {} })).post('/api/step-cards/check').send({})).status).toBe(401);
  });

  test('checks in the open project, and only checks it understands', async () => {
    const res = await request(app()).post('/api/step-cards/check').send({
      folder: tmp,
      checks: [{ id: 'f', kind: 'file', path: 'src/badge.js' }, { id: 'x', kind: 'run', command: 'rm -rf /' }, { id: 'b', kind: 'shell', command: 'ls' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ id: 'f', ok: true, line: 'Found src/badge.js.' }]);
  });

  test("a step sent to a coding agent is checked in that agent's worktree and reads what it said", async () => {
    const task = { id: 't1', status: 'done', summary: 'I added the badge.', folder: tmp, worktree: { cwd: tmp } };
    const res = await request(app({ task })).post('/api/step-cards/check').send({
      folder: '/not/open', cliTaskId: 't1', checks: [{ id: 'f', kind: 'file', path: 'src/badge.js' }, { id: 'a', kind: 'ask', statement: 'The badge is there' }],
    });
    expect(res.body.results.map((r) => r.ok)).toEqual([true, true]);
  });

  test('a project that is not open is never looked in', async () => {
    const res = await request(app()).post('/api/step-cards/check').send({ folder: '/etc', checks: [{ id: 'f', kind: 'file', path: 'passwd' }] });
    expect(res.body.results[0].ok).toBeNull();
  });

  test('cleanChecks rebuilds each check from its own words', () => {
    expect(cleanChecks([{ id: 'a', kind: 'file', path: 'x.js', extra: 'nope' }, { kind: 'file', path: 'no-id.js' }])).toEqual([{ id: 'a', kind: 'file', path: 'x.js' }]);
  });
});
