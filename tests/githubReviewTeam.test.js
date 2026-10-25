import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { runGit } from '../server/github/conflictFixer.js';
import { createWorktree } from '../server/cli-agents/worktrees.js';
import { getReview, postReview, resetReviews, startReview } from '../server/github/reviewTeam.js';
import { DIFF_FILE, mergeFindings, parseReviewText } from '../server/github/reviewMerge.js';

const answer = (summary, findings) => `I read it.\n\n\`\`\`json\n${JSON.stringify({ summary, findings })}\n\`\`\``;
const bug = (over) => ({ path: 'a.js', line: 2, end_line: 2, severity: 'medium', title: 'Off by one', explanation: 'Reads past the end.', suggestion: 'Use <.', pattern: 'loop bound', ...over });

describe('review team: reading and merging answers', () => {
  test('finds the JSON block at the end of a CLI answer', () => {
    expect(parseReviewText(answer('Fine.', [bug()]))).toMatchObject({ summary: 'Fine.', findings: [{ path: 'a.js', line: 2 }] });
    expect(parseReviewText('no json here')).toBeNull();
    expect(parseReviewText('{"summary": "bare", "findings": []}')).toEqual({ summary: 'bare', findings: [] });
  });

  test('the same spot from two reviewers is one finding, agreed-on first, most severe wins', () => {
    const merged = mergeFindings([
      { reviewer: 'Claude Code', findings: [bug({ line: 2 }), bug({ path: 'b.js', line: 9, severity: 'high', title: 'Leak' })] },
      { reviewer: 'Grok', findings: [bug({ line: 4, severity: 'high', title: 'Out of range' })] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ path: 'a.js', severity: 'high', title: 'Out of range', reviewers: ['Claude Code', 'Grok'] });
    expect(merged[1]).toMatchObject({ path: 'b.js', reviewers: ['Claude Code'] });
  });
});

describe('review team: end to end with stand-in CLIs', () => {
  let tmp;
  const sh = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-team-'));
    const origin = path.join(tmp, 'origin.git');
    const seed = path.join(tmp, 'seed');
    sh(['init', '--bare', '-b', 'master', origin], tmp);
    sh(['init', '-b', 'master', seed], tmp);
    fs.writeFileSync(path.join(seed, 'a.js'), 'const a = 1;\n');
    sh(['add', '.'], seed); sh(['commit', '-m', 'seed'], seed);
    sh(['checkout', '-b', 'feature'], seed);
    fs.writeFileSync(path.join(seed, 'a.js'), 'const a = 1;\nfor (let i = 0; i <= list.length; i++) use(list[i]);\n');
    fs.writeFileSync(path.join(seed, 'package-lock.json'), '{}\n');
    sh(['add', '.'], seed); sh(['commit', '-m', 'feature'], seed);
    sh(['remote', 'add', 'origin', origin], seed);
    sh(['push', 'origin', 'master', 'feature', 'feature:refs/pull/7/head'], seed);
  });
  afterEach(() => {
    resetReviews();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('two reviewers read the diff file in their own worktrees; the merged review posts inline', async () => {
    const pr = { number: 7, title: 'Loop over list', head: { ref: 'feature', repo: { full_name: 'o/r' } }, base: { ref: 'master' } };
    const posted = [];
    const octokit = { rest: { pulls: {
      get: async () => ({ data: pr }),
      createReview: async (args) => { posted.push(args); return { data: { html_url: 'https://github.com/o/r/pull/7#review' } }; },
    } } };
    const tasks = new Map();
    const seenDiffs = [];
    const manager = {
      get: (id) => tasks.get(id),
      async start({ cli, folder, baseOverride, prompt, prepare }) {
        expect(prompt).toContain(DIFF_FILE);
        expect(prompt).toContain('read-only review');
        expect(arguments[0].readOnly).toBe(true);
        const wt = await createWorktree({ repoRoot: folder, baseSha: baseOverride, taskId: cli, cli, env: { CENSAI_WORKTREE_DIR: path.join(tmp, 'wt') } });
        await prepare(wt.dir);
        seenDiffs.push(fs.readFileSync(path.join(wt.dir, DIFF_FILE), 'utf8'));
        expect(fs.readFileSync(path.join(wt.dir, 'a.js'), 'utf8')).toContain('list.length');
        const text = cli === 'grok'
          ? answer('Adds a loop. One bug.', [bug({ severity: 'high' })])
          : answer('Adds a loop.', [bug({ line: 3 }), bug({ line: 40, title: 'Elsewhere' })]);
        const task = { id: cli, status: 'running', permissions: [], costUsd: null, items: [{ kind: 'message', role: 'assistant', text }] };
        tasks.set(cli, task);
        setTimeout(() => { task.status = 'done'; }, 50);
        return task;
      },
    };
    const review = await startReview(
      { octokit, token: '', owner: 'o', repo: 'r', number: 7, reviewers: ['claudecode', 'grok', 'nope'], user: { name: 'Alma' } },
      { manager, git: runGit, remoteUrl: path.join(tmp, 'origin.git'), root: path.join(tmp, 'clones'), pollMs: 20 },
    );
    expect(review.reviewers.map((r) => r.label)).toEqual(['Claude Code', 'Grok']);
    expect(seenDiffs[0]).toContain('+for (let i = 0; i <= list.length');
    expect(seenDiffs[0]).not.toContain('package-lock.json');

    for (let i = 0; i < 50 && getReview(review.id).status === 'reviewing'; i++) await new Promise((r) => setTimeout(r, 20));
    const done = getReview(review.id);
    expect(done.status).toBe('done');
    expect(done.findings[0]).toMatchObject({ line: 2, severity: 'high', reviewers: ['Claude Code', 'Grok'] });
    expect(done.findings).toHaveLength(2);

    await postReview(done, { octokit });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ owner: 'o', repo: 'r', pull_number: 7, event: 'COMMENT' });
    expect(posted[0].comments).toEqual([expect.objectContaining({ path: 'a.js', line: 2, side: 'RIGHT' })]);
    expect(posted[0].comments[0].body).toContain('Found by 2 reviewers');
    expect(posted[0].body).toContain('`a.js:40`');
    expect(getReview(review.id).posted.url).toContain('#review');
  }, 20000);

  test('refuses to run without the desktop app guards, or with no reviewer picked', async () => {
    const args = { octokit: {}, token: '', owner: 'o', repo: 'r', number: 7 };
    await expect(startReview({ ...args, reviewers: [] }, { manager: {} })).rejects.toThrow(/at least one/);
    await expect(startReview({ ...args, reviewers: ['grok'] }, { manager: null })).rejects.toThrow(/desktop app/);
  });
});
