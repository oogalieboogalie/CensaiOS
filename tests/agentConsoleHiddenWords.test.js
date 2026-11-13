/**
 * A key a coding agent read in a file only this computer's owner opens never
 * reaches a teammate in what else the agent says, prints or changes. A
 * stand-in Claude Code (tests/fixtures/cli-agents/standin-agent.mjs) works in
 * a made-up repo: it reads .env, repeats the key in what it says, writes it
 * into config.js and prints that, greps a production .env it never opens, and
 * adds a remote with a made-up token. Pat Example (this computer's owner) sees
 * all of it; Sam Example (a teammate) sees [hidden] in place of each key and
 * token, and every other word as it was, also in a task Pat hands the changes
 * to for a review. All files, keys and words are made up.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
let live = null;
jest.unstable_mockModule('../server/cli-agents/index.js', () => ({ getCliTaskManager: () => live, cliRoster: () => [], forgetVersions: () => {} }));

const { CliTaskManager, buildHandoffPrompt } = await import('../server/cli-agents/taskManager.js');
const { cliAgentsRouter } = await import('../server/routes/cliAgents.js');
const { HIDDEN_MARK } = await import('../shared/files/fileProblems.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const STANDIN = path.join(here, 'fixtures', 'cli-agents', 'standin-agent.mjs');
const KEY = 'made-up-key-0123456789';
const OTHER = 'made-up-production-4242';
const TOKEN = 'made-up-token-777';
const SECRETS = [KEY, OTHER, TOKEN];
const STEPS = [
  { read: '.env' },
  { say: `The made-up key in .env is ${KEY}. I will put it in config.js.` },
  { write: 'config.js', content: `export const madeUpKey = '${KEY}';\n` },
  { bash: 'cat config.js', description: 'Show config.js' },
  { bash: 'grep -rn MADE_UP_PRODUCTION .', description: 'Find the production setting' },
  { say: `The production one is ${OTHER}.` },
  { bash: `git remote add made-up https://made-up-user:${TOKEN}@example.invalid/made-up.git && git remote -v`, description: 'Add the made-up remote' },
  { say: `Done: config.js holds ${KEY}, and the remote uses ${TOKEN}. MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME stay as they were.` },
];
// Handed off for a review, the stand-in prints config.js from the changes it was given and talks about it.
const REVIEW = [
  { bash: 'cat config.js', description: 'Look at config.js' },
  { say: `config.js sets madeUpKey to ${KEY}, which looks right.` },
];

let tmp;
let task;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function madeUpRepo() {
  const dir = path.join(tmp, 'made-up-repo');
  fs.mkdirSync(dir);
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'pat@example.invalid'], dir);
  git(['config', 'user.name', 'Pat Example'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Made-up shop\n');
  fs.writeFileSync(path.join(dir, '.env'), `MADE_UP_KEY=${KEY}\nNEXT_PUBLIC_SITE_NAME=Made-up Shop\nPORT=3001\n`);
  fs.writeFileSync(path.join(dir, '.env.production'), `MADE_UP_PRODUCTION_KEY=${OTHER}\n`);
  git(['add', '.'], dir);
  git(['commit', '-qm', 'made-up start'], dir);
  return dir;
}

async function finished(m, id) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const now = m.get(id);
    for (const p of now.permissions) if (p.status === 'pending') m.decide(id, p.id, { allow: true, user: { name: 'Pat Example' } });
    if (!['installing', 'starting', 'running', 'needs_approval'].includes(now.status)) return now;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`the made-up task did not finish (${m.get(id).status})`);
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-hidden-words-'));
  const script = path.join(tmp, 'made-up-script.json');
  fs.writeFileSync(script, JSON.stringify({ match: { review: REVIEW }, default: STEPS }));
  live = new CliTaskManager({
    env: {
      PATH: process.env.PATH,
      HOME: tmp,
      CENSAI_CLI_CLAUDECODE_BIN: STANDIN,
      CENSAI_WORKTREE_DIR: path.join(tmp, 'worktrees'),
      STANDIN_DELAY_MS: '5',
      STANDIN_SCRIPT: script,
      CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_DELAY_MS,STANDIN_SCRIPT',
    },
    install: async () => { throw new Error('no installs in tests'); },
  });
  const started = await live.start({ cli: 'claudecode', folder: madeUpRepo(), prompt: 'Put the made-up key in config.js', user: { name: 'Pat Example' } });
  task = await finished(live, started.id);
}, 30_000);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function app(userId) {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api/cli-agents', cliAgentsRouter);
  return a;
}
const get = (who, route) => request(app(who)).get(`/api/cli-agents${route}`).expect(200);
const named = (text) => SECRETS.filter((word) => text.includes(word));
const said = (body) => body.items.filter((i) => i.kind === 'message').map((i) => i.text);

test('the stand-in ran every step, so the made-up keys are in the task', () => {
  expect(task.status).toBe('done');
  expect(named(JSON.stringify(task.items))).toEqual(SECRETS);
});

describe('Pat, the owner,', () => {
  test('sees every key where the agent put it', async () => {
    const { body, text } = await get(PAT, `/tasks/${task.id}`);
    expect(named(text)).toEqual(SECRETS);
    expect(said(body)[0]).toBe(STEPS[1].say);
    expect(body.task.summary).toBe(STEPS[7].say);
    expect(body.items.some((i) => i.hiddenWords)).toBe(false);
    expect((await get(PAT, `/tasks/${task.id}/changes`)).body.patch).toContain(KEY);
    expect((await get(PAT, `/tasks/${task.id}/file?path=config.js`)).body.content).toContain(KEY);
  });
});

describe('Sam, a teammate,', () => {
  test('sees [hidden] for each key the agent repeats, and every other word as it was', async () => {
    const { body, text } = await get(SAM, `/tasks/${task.id}`);
    expect(named(text)).toEqual([]);
    expect(said(body)).toEqual([
      `The made-up key in .env is ${HIDDEN_MARK}. I will put it in config.js.`,
      `The production one is ${HIDDEN_MARK}.`,
      `Done: config.js holds ${HIDDEN_MARK}, and the remote uses ${HIDDEN_MARK}. MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME stay as they were.`,
    ]);
    expect(body.items.filter((i) => i.kind === 'message').every((i) => i.hiddenWords)).toBe(true);
    expect(body.task.summary).toBe(said(body)[2]);
  });

  test('sees the steps that wrote and printed the key with [hidden] in its place', async () => {
    const { body } = await get(SAM, `/tasks/${task.id}`);
    const step = (title) => body.items.find((i) => i.title === title);
    expect(step('Read .env')).toMatchObject({ ownerOnly: true });
    expect(step('Write config.js')).toMatchObject({ hiddenWords: true, diff: expect.objectContaining({ after: `export const madeUpKey = '${HIDDEN_MARK}';\n` }) });
    expect(step('Show config.js')).toMatchObject({ hiddenWords: true, output: expect.stringContaining(`'${HIDDEN_MARK}'`) });
    // The production .env's line is cut from the search, and its key from what the agent said about it.
    expect(step('Find the production setting')).toMatchObject({ output: './.env.production: …\n' });
    expect(step('Find the production setting')).not.toHaveProperty('hiddenWords');
    expect(step('Add the made-up remote')).toMatchObject({ command: 'git remote add made-up https://…@example.invalid/made-up.git && git remote -v' });
  });

  test('sees [hidden] in the task list, the requests, the changes and a file the agent wrote', async () => {
    const list = (await get(SAM, '/tasks')).body.tasks.find((t) => t.id === task.id);
    expect(list.summary).toContain(HIDDEN_MARK);
    const requests = await get(SAM, '/permissions?status=all');
    expect(named(requests.text)).toEqual([]);
    expect(requests.body.permissions.find((p) => p.title === 'Write config.js')).toMatchObject({ hiddenWords: true });
    const changes = await get(SAM, `/tasks/${task.id}/changes`);
    expect(named(changes.text)).toEqual([]);
    expect(changes.body.patch).toContain(`+export const madeUpKey = '${HIDDEN_MARK}';`);
    expect((await get(SAM, `/tasks/${task.id}/file?path=config.js`)).body.content).toBe(`export const madeUpKey = '${HIDDEN_MARK}';\n`);
  });
});

test('the review chat and a help card on the shared board get the words a teammate sees, whoever asks', async () => {
  const board = await get(PAT, `/tasks/${task.id}/changes?board=1`);
  expect(named(board.text)).toEqual([]);
  expect(board.body.summary).toContain(HIDDEN_MARK);
  const card = await get(PAT, `/tasks/${task.id}?since=1000000000&board=1`);
  expect(named(card.text)).toEqual([]);
  expect(card.body.task.summary).toBe(said((await get(SAM, `/tasks/${task.id}`)).body)[2]);
  expect(card.body.items).toEqual([]);
});

test('Open in Code Editor gets a file for the shared board as a teammate sees it, whoever asks', async () => {
  // The Code Editor window's words reach everyone on the board (TaskView's openFile asks with board=1).
  const board = await get(PAT, `/tasks/${task.id}/file?path=config.js&board=1`);
  expect(board.body).toEqual({ path: 'config.js', content: `export const madeUpKey = '${HIDDEN_MARK}';\n`, hiddenWords: true });
  expect((await get(SAM, `/tasks/${task.id}/file?path=config.js&board=1`)).body).toEqual(board.body);
  expect((await get(PAT, `/tasks/${task.id}/file?path=README.md&board=1`)).body).toEqual({ path: 'README.md', content: '# Made-up shop\n' });
  // A file only the owner opens still comes to Pat whole, marked to stay on Pat's screen.
  const own = await get(PAT, `/tasks/${task.id}/file?path=.env&board=1`);
  expect(own.body).toMatchObject({ ownerOnly: true, content: expect.stringContaining(`MADE_UP_KEY=${KEY}`) });
  expect(own.body).not.toHaveProperty('hiddenWords');
});

test('the agent handed the changes gets them as they are, as it reviews them on this computer', async () => {
  const { files, patch } = await live.changes(task.id);
  const prompt = buildHandoffPrompt({ source: live.get(task.id), ask: 'Review the made-up change.', files, patch });
  expect(prompt).toContain(`+export const madeUpKey = '${KEY}';`);
  expect(prompt).toContain(`Its summary:\n${STEPS[7].say}`);
});

test('a task handed the changes for a review hides the same words from Sam', async () => {
  const handed = await live.handoff(task.id, { cli: 'claudecode', user: { name: 'Pat Example' } });
  expect(handed).not.toHaveProperty('handoffHidden');
  const review = await finished(live, handed.id);
  expect(review.status).toBe('done');
  // This task never read .env itself; the key and the token come only from the changes and the summary it was handed.
  expect(named(JSON.stringify(review.items))).toEqual([KEY, TOKEN]);
  expect(named((await get(PAT, `/tasks/${review.id}`)).text)).toEqual([KEY, TOKEN]);
  const { body, text } = await get(SAM, `/tasks/${review.id}`);
  expect(named(text)).toEqual([]);
  expect(body.items.find((i) => i.kind === 'prompt')).toMatchObject({ hiddenWords: true, text: expect.stringContaining(`+export const madeUpKey = '${HIDDEN_MARK}';`) });
  expect(said(body)).toEqual([`config.js sets madeUpKey to ${HIDDEN_MARK}, which looks right.`]);
  expect(body.items.find((i) => i.title === 'Look at config.js')).toMatchObject({ hiddenWords: true, output: expect.stringContaining(`'${HIDDEN_MARK}'`) });
  expect(named((await get(SAM, `/tasks/${review.id}/changes`)).text)).toEqual([]);
  expect(named((await get(SAM, '/tasks')).text)).toEqual([]);
});
