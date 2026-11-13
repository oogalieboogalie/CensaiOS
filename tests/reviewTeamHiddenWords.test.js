/**
 * The review team never sends GitHub a key a reviewer read in a file only
 * this computer's owner opens. A stand-in Claude Code
 * (tests/fixtures/cli-agents/standin-agent.mjs) reviews a made-up pull
 * request: it reads the made-up shop's .env on this computer (not in the
 * repo), repeats its key, asks to run a command with it, and names it in its
 * summary and a finding. The owner (Pat Example) answers the request with
 * its words whole; the review window's summary and findings, and the review
 * GitHub gets, hold [hidden] in the key's place, while the reviewer's own
 * task keeps the key for the owner. All files, keys and words are made up.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CliTaskManager } from '../server/cli-agents/taskManager.js';
import { runGit } from '../server/github/conflictFixer.js';
import { answerForEveryone, getReview, postReview, resetReviews, reviewApprovals, startReview } from '../server/github/reviewTeam.js';
import { HIDDEN_MARK } from '../shared/files/fileProblems.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STANDIN = path.join(here, 'fixtures', 'cli-agents', 'standin-agent.mjs');
const KEY = 'made-up-review-key-0123456789';
const PAT = { name: 'Pat Example', userId: 1 };

let tmp;
let manager;
const env = { ...process.env, GIT_AUTHOR_NAME: 'Pat Example', GIT_AUTHOR_EMAIL: 'pat@example.invalid', GIT_COMMITTER_NAME: 'Pat Example', GIT_COMMITTER_EMAIL: 'pat@example.invalid' };
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });

/** A made-up repo on a stand-in GitHub (a bare repository) with pull request 7 open; returns its address. */
function madeUpOrigin() {
  const origin = path.join(tmp, 'origin.git');
  const seed = path.join(tmp, 'seed');
  git(['init', '-q', '--bare', '-b', 'master', origin], tmp);
  git(['init', '-q', '-b', 'master', seed], tmp);
  fs.writeFileSync(path.join(seed, 'app.js'), 'export const shop = "Made-up Shop";\n');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'made-up start'], seed);
  git(['checkout', '-qb', 'feature'], seed);
  fs.writeFileSync(path.join(seed, 'app.js'), 'export const shop = "Made-up Shop";\nconsole.log(process.env.MADE_UP_KEY);\n');
  git(['commit', '-qam', 'made-up change'], seed);
  git(['remote', 'add', 'origin', origin], seed);
  git(['push', '-q', 'origin', 'master', 'feature', 'feature:refs/pull/7/head'], seed);
  return origin;
}

/** The stand-in reviewer's steps: the shop's .env is on this computer, outside the repo. */
function reviewerSteps(envFile) {
  const answer = {
    summary: `Adds a log line. It prints MADE_UP_KEY, which is ${KEY} on this computer.`,
    findings: [
      { path: 'app.js', line: 2, severity: 'high', title: `app.js prints the key ${KEY}`, explanation: `Line 2 logs process.env.MADE_UP_KEY, so ${KEY} lands in every log.`, suggestion: `Log that the key is set, never ${KEY} itself.`, pattern: 'a secret in a log line' },
      { path: 'app.js', line: 1, severity: 'low', title: 'The shop name is fixed', explanation: 'The made-up shop name cannot change per place.' },
    ],
  };
  return [
    { read: envFile },
    { say: `The made-up shop's .env has MADE_UP_KEY=${KEY}.` },
    { bash: `echo made-up call with ${KEY}`, description: 'Try a made-up call with the key' },
    { say: `I read it.\n\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` },
  ];
}

async function until(ok, what, ms = 20_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = ok();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`waited for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-review-key-'));
  const shop = path.join(tmp, 'made-up-shop');
  fs.mkdirSync(shop);
  fs.writeFileSync(path.join(shop, '.env'), `MADE_UP_KEY=${KEY}\nPORT=3001\n`);
  const script = path.join(tmp, 'made-up-script.json');
  fs.writeFileSync(script, JSON.stringify({ match: { 'review pull request': reviewerSteps(path.join(shop, '.env')) } }));
  manager = new CliTaskManager({
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
});

afterAll(() => {
  resetReviews();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the review team and a key from a file only the owner opens', () => {
  test('the window and GitHub get [hidden] in its place; the owner answers the request whole', async () => {
    const posted = [];
    const octokit = { rest: { pulls: {
      get: async () => ({ data: { number: 7, title: 'Log the made-up key', head: { ref: 'feature' }, base: { ref: 'master' } } }),
      createReview: async (args) => { posted.push(args); return { data: { html_url: 'https://github.com/made-up/shop/pull/7#review' } }; },
    } } };
    const review = await startReview(
      { octokit, token: '', owner: 'made-up', repo: 'shop', number: 7, reviewers: ['claudecode'], user: PAT },
      { manager, git: runGit, remoteUrl: madeUpOrigin(), root: path.join(tmp, 'clones'), pollMs: 20 },
    );
    const taskId = review.reviewers[0].taskId;
    expect(taskId).toBeTruthy();

    // Only Pat, who started the review, sees its requests (a teammate gets "no longer here"): whole, to judge them.
    const [asked] = await until(() => { const list = reviewApprovals(getReview(review.id), manager); return list.length ? list : null; }, 'the request');
    expect(asked).toMatchObject({ taskId, reviewer: 'Claude Code' });
    expect(`${asked.title} ${asked.detail}`).toContain(KEY);
    manager.decide(taskId, asked.id, { allow: false, user: PAT });

    const done = await until(() => (getReview(review.id).status === 'reviewing' ? null : getReview(review.id)), 'the review');
    expect(done.status).toBe('done');
    expect(done.hiddenWords).toBe(true);
    const shown = JSON.stringify({ reviewers: done.reviewers, findings: done.findings });
    expect(shown).not.toContain(KEY);
    expect(done.reviewers[0].summary).toBe(`Adds a log line. It prints MADE_UP_KEY, which is ${HIDDEN_MARK} on this computer.`);
    const [keyFinding, nameFinding] = done.findings;
    expect(keyFinding).toMatchObject({
      path: 'app.js', line: 2, title: `app.js prints the key ${HIDDEN_MARK}`,
      explanation: `Line 2 logs process.env.MADE_UP_KEY, so ${HIDDEN_MARK} lands in every log.`,
      suggestion: `Log that the key is set, never ${HIDDEN_MARK} itself.`, pattern: 'a secret in a log line',
    });
    expect(nameFinding).toMatchObject({ title: 'The shop name is fixed', explanation: 'The made-up shop name cannot change per place.' });

    await postReview(done, { octokit });
    expect(posted).toHaveLength(1);
    expect(JSON.stringify(posted[0])).not.toContain(KEY);
    expect(posted[0].body).toContain(`which is ${HIDDEN_MARK} on this computer`);
    expect(posted[0].comments.map((c) => c.body).join('\n')).toContain(`app.js prints the key ${HIDDEN_MARK}`);

    // The owner still has the key in the reviewer's own task (the Agent Console).
    expect(JSON.stringify(manager.get(taskId).items)).toContain(KEY);
  }, 30_000);

  test('an answer that repeats no such key stays as the reviewer wrote it', () => {
    const task = { id: 'made-up', items: [{ kind: 'message', role: 'assistant', text: 'Fine.' }], permissions: [] };
    const finding = { path: 'a.js', line: 2, severity: 'low', title: 'Off by one', explanation: 'Reads past the end.', suggestion: 'Use <.' };
    expect(answerForEveryone(task, { summary: 'One small bug.', findings: [finding] })).toEqual({ summary: 'One small bug.', findings: [finding], hiddenWords: false });
  });
});
