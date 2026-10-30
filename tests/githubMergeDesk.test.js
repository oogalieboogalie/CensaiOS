import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  describePr,
  mergePr,
  resolveGithubToken,
  summarizeBody,
  summarizeChecks,
} from '../server/github/mergeDesk.js';
import { finishAndPush, fixApprovals, getFixJob, resetFixJobs, runGit, startFix, trackFixJob, watchTask } from '../server/github/conflictFixer.js';
import { createWorktree } from '../server/cli-agents/worktrees.js';
import { HIDDEN_MARK } from '../shared/files/fileProblems.js';

const ghError = (status, message) => Object.assign(new Error(message), { status, response: { data: { message } } });

describe('merge desk: plain status', () => {
  test('checks fold into one answer, and the WIP check is ignored on drafts', () => {
    const runs = [{ name: 'ci (22.x)', status: 'completed', conclusion: 'success' }];
    const wip = [{ context: 'WIP', state: 'pending' }];
    expect(summarizeChecks(runs, wip).state).toBe('running');
    expect(summarizeChecks(runs, wip, { ignore: (n) => n === 'WIP' })).toMatchObject({ state: 'passed', text: 'Checks passed' });
    expect(summarizeChecks([{ name: 'ci', status: 'completed', conclusion: 'failure' }], [])).toMatchObject({ state: 'failed', text: 'ci failed', failing: ['ci'] });
    expect(summarizeChecks([], []).state).toBe('none');
    // Newest status per context wins (GitHub lists newest first).
    expect(summarizeChecks([], [{ context: 'x', state: 'success' }, { context: 'x', state: 'failure' }]).state).toBe('passed');
  });

  test('the summary skips attribution, comments and headings', () => {
    const body = '<!-- claude-projects-attribution: {} -->\n_Requested by **Alma** · [thread](https://x)_\n\n## Summary\n\nBefore: the GitHub window needed five clicks to merge. More text here.';
    expect(summarizeBody(body)).toBe('the GitHub window needed five clicks to merge.');
    expect(summarizeBody('', 'Changes 2 files (+3 −1)')).toBe('Changes 2 files (+3 −1)');
  });

  test('a PR is green only when checks pass and there are no conflicts', () => {
    const pr = { number: 3, title: 't', html_url: 'u', user: { login: 'alma' }, draft: true, body: '', mergeable: true, mergeable_state: 'clean', head: { ref: 'a' }, base: { ref: 'master' }, changed_files: 1, additions: 2, deletions: 0 };
    const passed = summarizeChecks([], [{ context: 'ci', state: 'success' }]);
    expect(describePr(pr, passed)).toMatchObject({ green: true, conflicts: false, draft: true, author: 'alma' });
    expect(describePr({ ...pr, mergeable: false, mergeable_state: 'dirty' }, passed)).toMatchObject({ green: false, conflicts: true });
    expect(describePr(pr, summarizeChecks([{ name: 'ci', status: 'in_progress' }], [])).green).toBe(false);
  });

  test('the user token wins over the server token', async () => {
    process.env.GITHUB_TOKEN = 'server';
    expect(await resolveGithubToken(1, { loadUserKey: async () => ({ apiKey: 'mine' }) })).toEqual({ token: 'mine', source: 'byok' });
    expect(await resolveGithubToken(1, { loadUserKey: async () => null })).toEqual({ token: 'server', source: 'server' });
    delete process.env.GITHUB_TOKEN;
    expect((await resolveGithubToken(null)).source).toBeNull();
  });
});

function fakeOctokit({ pr, mergeFailures = [] }) {
  const calls = { graphql: 0, merge: [] };
  const failures = [...mergeFailures];
  return {
    calls,
    graphql: async () => { calls.graphql++; },
    rest: {
      pulls: {
        get: async () => ({ data: pr }),
        merge: async (args) => {
          calls.merge.push(args);
          const next = failures.shift();
          if (next) throw next;
          return { data: { sha: 'merged-sha', merged: true } };
        },
        updateBranch: async () => { throw ghError(422, 'merge conflict between base and head'); },
      },
      repos: { get: async () => ({ data: { allow_merge_commit: true } }) },
    },
  };
}

describe('merge desk: one-tap merge', () => {
  const base = { number: 9, state: 'open', merged: false, draft: true, node_id: 'N', mergeable: true, head: { sha: 'abc' } };

  test('marks a draft ready, waits out a settling check, merges with a merge commit', async () => {
    const octokit = fakeOctokit({ pr: base, mergeFailures: [ghError(405, 'Required status check "WIP" is expected.')] });
    const result = await mergePr(octokit, { owner: 'o', repo: 'r', number: 9 }, { sleep: async () => {} });
    expect(result).toMatchObject({ merged: true, sha: 'merged-sha', method: 'merge', markedReady: true });
    expect(octokit.calls.graphql).toBe(1);
    expect(octokit.calls.merge).toHaveLength(2);
    expect(octokit.calls.merge[0]).toMatchObject({ merge_method: 'merge', sha: 'abc' });
  });

  test('says what to do in plain words when GitHub refuses', async () => {
    await expect(mergePr(fakeOctokit({ pr: { ...base, draft: false, mergeable: false } }), { owner: 'o', repo: 'r', number: 9 }))
      .rejects.toThrow(/Fix conflicts/);
    await expect(mergePr(fakeOctokit({ pr: { ...base, draft: false }, mergeFailures: [ghError(403, 'Resource not accessible')] }), { owner: 'o', repo: 'r', number: 9 }))
      .rejects.toThrow(/write access/);
    const done = await mergePr(fakeOctokit({ pr: { ...base, merged: true, merge_commit_sha: 's' } }), { owner: 'o', repo: 'r', number: 9 });
    expect(done).toMatchObject({ merged: true, already: true });
  });
});

describe('fix conflicts: agent merge is checked and pushed', () => {
  let tmp;
  const sh = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-desk-'));
    const origin = path.join(tmp, 'origin.git');
    const seed = path.join(tmp, 'seed');
    sh(['init', '--bare', '-b', 'master', origin], tmp);
    sh(['init', '-b', 'master', seed], tmp);
    fs.writeFileSync(path.join(seed, 'a.txt'), 'one\n');
    sh(['add', '.'], seed); sh(['commit', '-m', 'seed'], seed);
    sh(['checkout', '-b', 'feature'], seed);
    fs.writeFileSync(path.join(seed, 'a.txt'), 'feature\n');
    sh(['commit', '-am', 'feature'], seed);
    sh(['checkout', 'master'], seed);
    fs.writeFileSync(path.join(seed, 'a.txt'), 'master\n');
    sh(['commit', '-am', 'master'], seed);
    sh(['remote', 'add', 'origin', origin], seed);
    sh(['push', 'origin', 'master', 'feature'], seed);
  });
  afterEach(() => {
    resetFixJobs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('update branch hits conflicts, the agent resolves, Homebase pushes a merge commit', async () => {
    const origin = path.join(tmp, 'origin.git');
    const pr = { number: 4, state: 'open', title: 'Feature', head: { ref: 'feature', sha: 'x', repo: { full_name: 'o/r' } }, base: { ref: 'master', repo: { full_name: 'o/r' } } };
    const tasks = new Map();
    const manager = {
      get: (id) => tasks.get(id),
      async start({ folder, baseOverride, prompt }) {
        expect(prompt).toMatch(/git merge --no-edit origin\/master/);
        const wt = await createWorktree({ repoRoot: folder, baseSha: baseOverride, taskId: 't1', cli: 'claudecode', env: { CENSAI_WORKTREE_DIR: path.join(tmp, 'wt') } });
        // What the agent does: merge, resolve keeping both sides, leave the commit to Homebase.
        try { sh(['merge', '--no-edit', 'origin/master'], wt.dir); } catch { /* conflict expected */ }
        fs.writeFileSync(path.join(wt.dir, 'a.txt'), 'master\nfeature\n');
        const task = { id: 't1', status: 'done', permissions: [], summary: 'Kept both lines.', worktree: { dir: wt.dir } };
        tasks.set('t1', task);
        return task;
      },
    };
    const job = await startFix(
      { octokit: fakeOctokit({ pr }), token: '', owner: 'o', repo: 'r', number: 4, user: { name: 'Alma' } },
      { manager, git: runGit, remoteUrl: origin, root: path.join(tmp, 'fixes') },
    );
    expect(job.status).toBe('agent');
    for (let i = 0; i < 40 && !['done', 'failed'].includes(getFixJob(job.id).status); i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (getFixJob(job.id).status !== 'done') throw new Error(getFixJob(job.id).text);
    expect(getFixJob(job.id)).toMatchObject({ status: 'done', agentSummary: 'Kept both lines.' });
    expect(sh(['show', 'feature:a.txt'], origin)).toBe('master\nfeature\n');
    expect(sh(['rev-list', '--parents', '-n', '1', 'feature'], origin).trim().split(' ')).toHaveLength(3);
  }, 20000);

  test('refuses to push leftover conflict markers', async () => {
    const dir = path.join(tmp, 'check');
    sh(['clone', path.join(tmp, 'origin.git'), dir], tmp);
    sh(['checkout', 'feature'], dir);
    try { sh(['merge', '--no-edit', 'origin/master'], dir); } catch { /* conflict */ }
    sh(['add', '-A'], dir);
    sh(['commit', '--no-edit'], dir);
    await expect(finishAndPush({ job: { baseRef: 'master', headRef: 'feature' }, task: { worktree: { dir } }, git: runGit, token: '' }))
      .rejects.toThrow(/Conflict markers/);
  });
});

describe('merge desk: a fix job on the shared board', () => {
  const KEY = 'made-up-key-0123456789';
  // The agent read a made-up .env, then asks to run a command with its key and repeats it in its summary.
  const fixTask = (more = {}) => ({
    id: 'made-up-fix', status: 'needs_approval', rev: 2, summary: `Kept both sides; the key is still ${KEY}.`, worktree: { dir: '/made-up/fixes/wt' },
    items: [{ id: 'r', kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}`, rev: 1 }],
    permissions: [{ id: 'p1', taskId: 'made-up-fix', status: 'pending', kind: 'command', title: 'Run a command', detail: `echo ${KEY} > made-up.txt`, rev: 2 }],
    ...more,
  });
  afterEach(() => resetFixJobs());

  test("the agent's approvals show a key it read in a file only the owner opens as [hidden]", () => {
    expect(fixApprovals({ taskId: 'made-up-fix' }, { get: () => fixTask() })).toEqual([{ id: 'p1', title: 'Run a command', detail: `echo ${HIDDEN_MARK} > made-up.txt` }]);
  });

  test("the agent's summary shows that key as [hidden] too", async () => {
    const done = fixTask({ status: 'done', permissions: [] });
    const job = trackFixJob({ id: 'made-up-job', status: 'agent', taskId: 'made-up-fix', token: '' });
    watchTask(job, { manager: { get: () => done }, git: runGit, finish: async () => 'made-up-sha' });
    for (let i = 0; i < 40 && getFixJob(job.id).status !== 'done'; i++) await new Promise((r) => setTimeout(r, 100));
    expect(getFixJob(job.id)).toMatchObject({ status: 'done', sha: 'made-up-sha', agentSummary: `Kept both sides; the key is still ${HIDDEN_MARK}.` });
  });
});
