import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import express from 'express';
import request from 'supertest';
import { agentDock, agentItem, buildInbox, prItem, taskRepo } from '../server/inbox/collect.js';
import { listReports, registerInboxSource, resetInboxSources } from '../server/inbox/sources.js';
import { buildCiFixPrompt, pushCiFix, startCiFix } from '../server/inbox/ciFix.js';
import { getFixJob, resetFixJobs, runGit } from '../server/github/conflictFixer.js';
import { createWorktree } from '../server/cli-agents/worktrees.js';
import { createInboxRouter } from '../server/routes/inbox.js';
import { registerSelfFixSource, setSelfFixLoader } from '../server/inbox/selfFixSource.js';

const pr = (n, over = {}) => ({
  number: n, title: `PR ${n}`, url: `https://github.com/o/r/pull/${n}`, author: 'alma', draft: false, summary: 's',
  size: { files: 2, additions: 10, deletions: 1 }, headRef: 'feat', baseRef: 'master', updatedAt: '2026-10-15T04:00:00Z',
  checks: { state: 'passed', text: 'Checks passed', failing: [] }, conflicts: false, mergeKnown: true, green: true, ...over,
});

const task = (id, over = {}) => ({
  id, cli: 'claudecode', cliLabel: 'Claude Code', title: `Task ${id}`, status: 'running', running: true,
  repoRoot: '/home/a/.censai/github-fixes/acme__web', createdAt: Date.now() - 120000, updatedAt: Date.now(),
  usage: { input: 1000, output: 500 }, createdBy: { name: 'Alma' }, ...over,
});

describe('inbox: items in plain words', () => {
  test('a pull request lands in the group that says what it needs', () => {
    expect(prItem(pr(1, { checks: { state: 'failed', text: 'lint failed', failing: ['lint'] } }), 'o/r')).toMatchObject({ group: 'needs', state: 'ci_failed', title: 'Checks failed on #1', actions: ['fix_ci', 'open', 'acknowledge'], failing: ['lint'] });
    expect(prItem(pr(2, { conflicts: true }), 'o/r')).toMatchObject({ group: 'needs', state: 'conflict', actions: ['fix_conflicts', 'open', 'acknowledge'] });
    expect(prItem(pr(3, { checks: { state: 'running', text: 'Checks running', failing: [] } }), 'o/r')).toMatchObject({ group: 'working' });
    expect(prItem(pr(4), 'o/r')).toMatchObject({ group: 'ready', state: 'green', id: 'pr:o/r#4' });
  });

  test('agent tasks: waiting for an OK needs you, running is in progress', () => {
    expect(agentItem(task('a', { status: 'needs_approval' }))).toMatchObject({ group: 'needs', state: 'needs_approval', repo: 'acme/web' });
    expect(agentItem(task('b'))).toMatchObject({ group: 'working', state: 'agent_running' });
    expect(agentItem(task('c', { status: 'failed', running: false }))).toMatchObject({ group: 'needs', state: 'agent_failed' });
    expect(agentItem(task('d', { status: 'done', running: false })).group).toBe('done');
    expect(taskRepo({ repoRoot: 'D:\\Repos\\CensaiHub' })).toBe('CensaiHub');
  });

  test('the dock lists running agents by repo and tokens over three days', () => {
    const dock = agentDock([task('a'), task('b', { cli: 'codex', cliLabel: 'Codex', usage: { input: 2000, output: 0 } }), task('old', { running: false, createdAt: Date.now() - 5 * 86400000 })]);
    expect(dock.repos).toEqual([{ repo: 'acme/web', tasks: expect.arrayContaining([expect.objectContaining({ taskId: 'a' }), expect.objectContaining({ taskId: 'b' })]) }]);
    expect(dock.tokens).toEqual([{ label: 'Codex', total: 2000 }, { label: 'Claude Code', total: 1500 }]);
  });

  test('needs-you items come first; error reports become items with plain numbers', () => {
    const inbox = buildInbox({
      desk: { repo: 'o/r', prs: [pr(4), pr(1, { checks: { state: 'failed', text: 'x failed', failing: ['x'] } })] },
      tasks: [task('b')],
      reports: [{ id: 'e1', title: 'TypeError: price is undefined', count: 12, lastHour: 11, lastSeen: new Date().toISOString(), source: 'errors', fixable: true }],
    });
    expect(inbox.items.map((i) => i.group)).toEqual(['needs', 'needs', 'working', 'ready']);
    const err = inbox.items.find((i) => i.kind === 'error');
    expect(err).toMatchObject({ state: 'error_escalating', actions: ['fix_error', 'acknowledge'] });
    expect(err.stats[0]).toEqual({ label: 'Last hour', value: '11', tone: 'danger' });
  });
});

describe('inbox: sources hook', () => {
  afterEach(resetInboxSources);
  test('a broken source is skipped and named, the others still show', async () => {
    registerInboxSource('good', { list: async () => [{ id: 'g', title: 'ok', fixable: true }] });
    registerInboxSource('bad', { list: async () => { throw new Error('down'); } });
    const { reports, sourceErrors } = await listReports();
    expect(reports).toEqual([{ id: 'g', title: 'ok', source: 'good', fixable: false }]); // no fix() → not fixable
    expect(sourceErrors).toEqual({ bad: 'down' });
  });
});

describe('inbox: self-fix reports', () => {
  afterEach(resetInboxSources);
  test('the owner sees open reports and can send one to Claude Code; others see nothing', async () => {
    const now = Date.now();
    const reports = new Map([
      ['a', { id: 'a', status: 'saved', title: 'TypeError: price is undefined', message: 'TypeError: price is undefined', count: 4, firstSeen: now - 9e6, lastSeen: now - 1000, windowKind: 'leadHound' }],
      ['b', { id: 'b', status: 'applied', title: 'Old', count: 1, firstSeen: now, lastSeen: now }],
    ]);
    const started = [];
    setSelfFixLoader(async () => ({
      store: { list: () => [...reports.values()], get: (id) => reports.get(id), update: (id, p) => Object.assign(reports.get(id), p) },
      maybeFix: async (r, opts) => { started.push([r.id, opts]); reports.get(r.id).status = 'fixing'; return true; },
    }));
    registerSelfFixSource();
    expect((await listReports({ isOwner: false, localFiles: true })).reports).toEqual([]);
    const { reports: open } = await listReports({ isOwner: true, localFiles: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: 'a', count: 4, fixable: true, source: 'self-fix', lastHour: null });
    const item = buildInbox({ reports: open }).items[0];
    expect(item).toMatchObject({ kind: 'error', actions: ['fix_error', 'acknowledge'] });
    expect(item.stats[0].label).toBe('Last seen');
    const { fixReport } = await import('../server/inbox/sources.js');
    expect((await fixReport('self-fix', { isOwner: true, localFiles: true, reportId: 'a' })).text).toMatch(/Claude Code is fixing it/);
    expect(started).toEqual([['a', { manual: true }]]);
    await expect(fixReport('self-fix', { isOwner: false, localFiles: true, reportId: 'a' })).rejects.toThrow(/owner/);
  });
});

describe('inbox route', () => {
  afterEach(resetInboxSources);
  test('without a GitHub token it still lists agents and reports', async () => {
    delete process.env.GITHUB_TOKEN;
    registerInboxSource('errors', { list: async () => [{ id: 'e', title: 'Boom', count: 1, lastHour: 1, lastSeen: new Date().toISOString() }] });
    const app = express();
    app.use((req, _res, next) => { req.session = { userId: null }; next(); });
    app.use('/api/inbox', createInboxRouter({ isOwner: async () => false, loadManager: async () => ({ list: () => [task('a', { status: 'needs_approval' })] }) }));
    const anon = await request(app).get('/api/inbox?repo=o/r');
    expect(anon.status).toBe(401);
    const app2 = express();
    app2.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
    app2.use('/api/inbox', createInboxRouter({ isOwner: async () => false, loadManager: async () => ({ list: () => [task('a', { status: 'needs_approval' })] }) }));
    const res = await request(app2).get('/api/inbox?repo=o/r');
    expect(res.status).toBe(200);
    expect(res.body.github.connected).toBe(false);
    expect(res.body.items.map((i) => i.kind).sort()).toEqual(['agent', 'error']);
    expect(res.body.dock.repos[0].repo).toBe('acme/web');
  });

  test("a teammate's inbox shows a task's summary without a key file's lines, and the owner's shows it whole", async () => {
    delete process.env.GITHUB_TOKEN;
    const KEY = 'not-a-real-made-up-key';
    const summary = `Made-up summary\n./.env:MADE_UP_KEY=${KEY}`;
    const loadManager = async () => ({ list: () => [task('a', { status: 'done', running: false, summary, worktree: { dir: '/made-up/.censai/worktrees/a' } })] });
    const agentFor = async (owner) => {
      const app = express();
      app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
      app.use('/api/inbox', createInboxRouter({ isOwner: async () => owner, loadManager }));
      const res = await request(app).get('/api/inbox?repo=o/r').expect(200);
      return res.body.items.find((i) => i.kind === 'agent');
    };
    expect((await agentFor(false)).summary).toBe('Made-up summary\n./.env: …');
    expect((await agentFor(true)).summary).toBe(summary);
  });

  test("a teammate's inbox shows [hidden] where a task's summary repeats a key the agent read in .env, and the owner's shows it", async () => {
    delete process.env.GITHUB_TOKEN;
    const KEY = 'made-up-key-0123456789';
    const listed = task('b', { status: 'done', running: false, summary: `Done: config.js holds ${KEY}.`, worktree: { dir: '/made-up/.censai/worktrees/b' } });
    const read = { id: 'i1', kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}`, status: 'done' };
    const loadManager = async () => ({ list: () => [listed], get: () => ({ ...listed, items: [read], permissions: [] }) });
    const agentFor = async (owner) => {
      const app = express();
      app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
      app.use('/api/inbox', createInboxRouter({ isOwner: async () => owner, loadManager }));
      const res = await request(app).get('/api/inbox?repo=o/r').expect(200);
      return res.body.items.find((i) => i.kind === 'agent');
    };
    expect((await agentFor(false)).summary).toBe('Done: config.js holds [hidden].');
    expect((await agentFor(true)).summary).toBe(`Done: config.js holds ${KEY}.`);
  });
});

describe('fix red checks: the agent commit is checked and pushed', () => {
  let tmp;
  const sh = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-ci-'));
    const origin = path.join(tmp, 'origin.git');
    const seed = path.join(tmp, 'seed');
    sh(['init', '--bare', '-b', 'master', origin], tmp);
    sh(['init', '-b', 'master', seed], tmp);
    fs.writeFileSync(path.join(seed, 'a.js'), 'const x = 1\n');
    sh(['add', '.'], seed); sh(['commit', '-m', 'seed'], seed);
    sh(['checkout', '-b', 'feature'], seed);
    fs.writeFileSync(path.join(seed, 'a.js'), 'const x = ;\n');
    sh(['commit', '-am', 'broken'], seed);
    sh(['remote', 'add', 'origin', origin], seed);
    sh(['push', 'origin', 'master', 'feature'], seed);
  });
  afterEach(() => {
    resetFixJobs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('the prompt names what failed and forbids skipping tests', () => {
    const text = buildCiFixPrompt({ pr: { number: 9, title: 'T', headRef: 'feature' }, repo: 'o/r', checks: [{ name: 'lint', url: 'u', detail: 'a.js:1 unexpected token', notes: ['a.js:1 Parsing error'] }] });
    expect(text).toMatch(/- lint \(u\)/);
    expect(text).toMatch(/a\.js:1 Parsing error/);
    expect(text).toMatch(/Never skip, disable or delete a test/);
  });

  test('the agent fixes the file, Homebase commits and pushes on top of the PR head', async () => {
    const origin = path.join(tmp, 'origin.git');
    const headSha = sh(['rev-parse', 'feature'], origin).trim();
    const prData = { number: 9, state: 'open', title: 'Broken', head: { ref: 'feature', sha: headSha, repo: { full_name: 'o/r' } }, base: { ref: 'master', repo: { full_name: 'o/r' } } };
    const octokit = { rest: {
      pulls: { get: async () => ({ data: prData }) },
      checks: {
        listForRef: async () => ({ data: { check_runs: [{ id: 1, name: 'lint', status: 'completed', conclusion: 'failure', output: { title: 'Parsing error' } }] } }),
        listAnnotations: async () => ({ data: [{ path: 'a.js', start_line: 1, message: 'Unexpected token' }] }),
      },
    } };
    const tasks = new Map();
    const manager = {
      get: (id) => tasks.get(id),
      async start({ folder, baseOverride, prompt }) {
        expect(prompt).toMatch(/a\.js:1 Unexpected token/);
        const wt = await createWorktree({ repoRoot: folder, baseSha: baseOverride, taskId: 'c1', cli: 'claudecode', env: { CENSAI_WORKTREE_DIR: path.join(tmp, 'wt') } });
        fs.writeFileSync(path.join(wt.dir, 'a.js'), 'const x = 2;\n'); // fixed, left uncommitted
        const t = { id: 'c1', status: 'done', permissions: [], summary: 'Fixed the typo.', worktree: { dir: wt.dir } };
        tasks.set('c1', t);
        return t;
      },
    };
    const job = await startCiFix({ octokit, token: '', owner: 'o', repo: 'r', number: 9, user: { name: 'Alma' } }, { manager, git: runGit, remoteUrl: origin, root: path.join(tmp, 'fixes') });
    expect(job).toMatchObject({ status: 'agent', kind: 'ci', failing: ['lint'] });
    for (let i = 0; i < 40 && !['done', 'failed'].includes(getFixJob(job.id).status); i++) await new Promise((r) => setTimeout(r, 200));
    if (getFixJob(job.id).status !== 'done') throw new Error(getFixJob(job.id).text);
    expect(sh(['show', 'feature:a.js'], origin)).toBe('const x = 2;\n');
    expect(sh(['rev-parse', 'feature~1'], origin).trim()).toBe(headSha);
  }, 20000);

  test('nothing changed means nothing is pushed', async () => {
    const dir = path.join(tmp, 'check');
    sh(['clone', path.join(tmp, 'origin.git'), dir], tmp);
    sh(['checkout', 'feature'], dir);
    const headSha = sh(['rev-parse', 'HEAD'], dir).trim();
    await expect(pushCiFix({ job: { headSha, headRef: 'feature' }, task: { worktree: { dir } }, git: runGit, token: '' })).rejects.toThrow(/without changing anything/);
  });

  test('a fork or a cloud board explains itself instead of starting', async () => {
    const prData = { number: 3, state: 'open', title: 'x', head: { ref: 'f', sha: 's', repo: { full_name: 'fork/r' } }, base: { ref: 'master', repo: { full_name: 'o/r' } } };
    const octokit = { rest: { pulls: { get: async () => ({ data: prData }) } } };
    expect((await startCiFix({ octokit, owner: 'o', repo: 'r', number: 3 }, {})).text).toMatch(/fork/);
    prData.head.repo.full_name = 'o/r';
    expect((await startCiFix({ octokit, owner: 'o', repo: 'r', number: 3 }, { manager: null })).text).toMatch(/desktop app/);
  });
});
