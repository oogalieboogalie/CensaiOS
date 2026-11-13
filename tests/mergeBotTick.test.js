import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MERGE_WRITES, createGitHub, squashMergeRequest } from '../server/mergeBot/github.js';
import { runKrakenLock } from '../server/mergeBot/lock.js';
import { createRevokeStore } from '../server/mergeBot/revokes.js';
import { runMergeBotTick } from '../server/mergeBot/worker.js';
import { gatekeeperKeys } from './mergeBotSign.js';

const SHA = 'c'.repeat(40);
const REPO = 'acme/widgets';
const keys = gatekeeperKeys();

function config(over = {}) {
  return {
    enabled: true,
    dryRun: false,
    token: 'test-token',
    repo: REPO,
    publicKey: keys.pem,
    checkName: 'ci (22.x)',
    intervalMs: 60_000,
    ...over,
  };
}

function pull(over = {}) {
  return {
    number: 12,
    headSha: SHA,
    draft: false,
    title: 'Fix the empty list',
    author: 'builder',
    mergeable: true,
    base: 'master',
    fork: false,
    url: 'https://github.com/acme/widgets/pull/12',
    ...over,
  };
}

function cleared(sha = SHA, number = 12) {
  return [{
    body: keys.line('clear', REPO, number, sha),
    createdAt: '2026-11-11T00:00:00Z',
  }];
}

function githubFor(row, extras = {}) {
  const calls = [];
  return {
    calls,
    async listOpenPulls() {
      calls.push('list');
      return { numbers: [row.number], complete: extras.complete !== false };
    },
    async loadPull() {
      calls.push('load');
      if (extras.loadError) throw Object.assign(new Error('github'), { code: 'github-500' });
      return row;
    },
    async comments() {
      return extras.comments || cleared(row.headSha, row.number);
    },
    async checks() {
      return extras.checks || [{
        name: 'ci (22.x)',
        sha: row.headSha,
        conclusion: 'success',
        status: 'completed',
        completedAt: '2026-11-11T00:00:01Z',
        appId: 15368,
      }];
    },
    async files() {
      return extras.files || ['src/components/Ok.jsx'];
    },
    async commits() {
      return extras.commits || [row.headSha];
    },
    async squashMerge(args) {
      calls.push(['squash', args.sha, args.number]);
    },
    async push() {
      calls.push('push');
    },
  };
}

function store() {
  const risky = [];
  const settled = [];
  const resolved = [];
  return {
    risky,
    settled,
    resolved,
    upsertRisky(item) { risky.push(item); },
    resolveRisky(number) { resolved.push(number); },
    settleClosed(numbers) { settled.push(numbers); },
  };
}

describe('merge bot pass', () => {
  test('does nothing until it is turned on, and never without a token or a repo', async () => {
    const github = githubFor(pull());
    expect(await runMergeBotTick({ config: config({ enabled: false }), github })).toEqual({ skipped: 'disabled' });
    expect(await runMergeBotTick({ config: config({ token: '' }), github })).toEqual({ skipped: 'no-token' });
    expect(await runMergeBotTick({ config: config({ repo: '' }), github })).toEqual({ skipped: 'no-repo' });
    expect(await runMergeBotTick({
      config: config({ publicKey: '', token: '' }),
      github,
    })).toEqual({ skipped: 'no-token' });
    expect(github.calls).toEqual([]);
  });

  test('a clear green pull request is squash-merged at that commit and not pushed', async () => {
    const github = githubFor(pull());
    const book = store();
    const result = await runMergeBotTick({
      config: config(),
      github,
      lock: async () => ({ ok: true }),
      store: book,
    });
    expect(result.results).toEqual([{ number: 12, action: 'merge', reason: 'clear' }]);
    expect(github.calls).toContainEqual(['squash', SHA, 12]);
    expect(github.calls).not.toContain('push');
    expect(book.resolved).toEqual([12]);
  });

  test('dry-run leaves a ready pull request unmerged', async () => {
    const github = githubFor(pull());
    const result = await runMergeBotTick({
      config: config({ dryRun: true }),
      github,
      lock: async () => ({ ok: true }),
      store: store(),
    });
    expect(result.results[0]).toMatchObject({ action: 'dry-run', reason: 'dry-run' });
    expect(github.calls.some((call) => Array.isArray(call) && call[0] === 'squash')).toBe(false);
  });

  test('a moved commit, a red lock, and an unreadable pull request do not merge', async () => {
    const moved = githubFor(pull(), { comments: cleared('d'.repeat(40)) });
    expect((await runMergeBotTick({
      config: config(), github: moved, lock: async () => ({ ok: true }), store: store(),
    })).results[0].reason).toBe('no-clear');

    const locked = githubFor(pull());
    expect((await runMergeBotTick({
      config: config(), github: locked, lock: async () => ({ ok: false }), store: store(),
    })).results[0].reason).toBe('file-lock');

    const unread = githubFor(pull(), { loadError: true });
    expect((await runMergeBotTick({
      config: config(), github: unread, lock: async () => ({ ok: true }), store: store(),
    })).results[0].reason).toBe('unread');
    expect(moved.calls.concat(locked.calls, unread.calls).some((call) => Array.isArray(call))).toBe(false);
  });

  test('pull request 300 is never read and never merged', async () => {
    const github = githubFor(pull({ number: 300 }));
    const result = await runMergeBotTick({
      config: config(), github, lock: async () => ({ ok: true }), store: store(),
    });
    expect(result.results).toEqual([{ number: 300, action: 'refuse', reason: 'never-300' }]);
    expect(github.calls).toEqual(['list']);
  });

  test('a dependency change is recorded for the owner and not merged', async () => {
    const github = githubFor(pull(), { files: ['package.json', 'src/components/Ok.jsx'] });
    const book = store();
    const result = await runMergeBotTick({
      config: config(), github, lock: async () => ({ ok: true }), store: book,
    });
    expect(result.results[0]).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(book.risky[0].title).toBe('Pull request 12 needs you');
    expect(book.risky[0].detail).toMatch(/dependencies/);
    expect(book.risky[0].url).toBe('https://github.com/acme/widgets/pull/12');
    expect(github.calls.some((call) => Array.isArray(call))).toBe(false);
  });

  test('a change to the merge rules is not merged', async () => {
    const github = githubFor(pull(), { files: ['server/mergeBot/risk.js'] });
    const result = await runMergeBotTick({
      config: config(), github, lock: async () => ({ ok: true }), store: store(),
    });
    expect(result.results[0]).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(github.calls.some((call) => Array.isArray(call))).toBe(false);
  });

  test('a remembered revoke still blocks after the comment is gone', async () => {
    const file = path.join(os.tmpdir(), `revokes-tick-${process.pid}.json`);
    const first = githubFor(pull(), {
      comments: [{ body: `needs-changes ${SHA}`, createdAt: '2026-11-11T00:00:02Z' }, ...cleared()],
    });
    const book = createRevokeStore({ file });
    const blocked = await runMergeBotTick({
      config: config(), github: first, lock: async () => ({ ok: true }), store: store(), revokes: book,
    });
    expect(blocked.results[0].action).not.toBe('merge');
    const second = githubFor(pull());
    const again = await runMergeBotTick({
      config: config(), github: second, lock: async () => ({ ok: true }), store: store(), revokes: createRevokeStore({ file }),
    });
    expect(again.results[0]).toMatchObject({ action: 'wait', reason: 'no-clear' });
    fs.rmSync(file, { force: true });
  });

  test('a revoke list with nowhere to live does not merge', async () => {
    const github = githubFor(pull());
    const result = await runMergeBotTick({
      config: config(),
      github,
      lock: async () => ({ ok: true }),
      revokeOptions: { env: { CENSAI_STATE_DIR: '/app/src' }, home: '/root', root: '/app' },
    });
    expect(result).toEqual({ skipped: 'revokes' });
    expect(github.calls).toEqual([]);
  });

  test('without the public key a pasted line does not merge', async () => {
    const github = githubFor(pull());
    const result = await runMergeBotTick({
      config: config({ publicKey: '' }), github, lock: async () => ({ ok: true }), store: store(),
    });
    expect(result.results[0]).toMatchObject({ action: 'wait', reason: 'no-clear' });
    expect(github.calls.some((call) => Array.isArray(call))).toBe(false);
  });

  test('a failed squash is a wait, not a push', async () => {
    const github = githubFor(pull());
    github.squashMerge = async () => { throw Object.assign(new Error('nope'), { code: 'github-405' }); };
    const result = await runMergeBotTick({
      config: config(), github, lock: async () => ({ ok: true }), store: store(),
    });
    expect(result.results[0]).toMatchObject({ action: 'wait', reason: 'merge-failed' });
  });
});

describe('github write', () => {
  test('the only write is a squash merge of one commit', () => {
    const sha = 'ab'.repeat(20);
    const call = squashMergeRequest({ repo: 'acme/widgets', number: 4, sha });
    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/repos/acme/widgets/pulls/4/merge');
    expect(call.body).toEqual({ merge_method: 'squash', sha });
    expect(call.body).not.toHaveProperty('force');
    expect(MERGE_WRITES).toEqual(['squash']);
    expect(Object.keys(createGitHub())).not.toContain('push');
  });

  test('squash merge uses the token from the caller and not a push url', async () => {
    const seen = [];
    const fetchImpl = async (url, opts) => {
      seen.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ merged: true }), text: async () => '' };
    };
    await createGitHub(fetchImpl).squashMerge({
      token: 'test-token', repo: 'acme/widgets', number: 4, sha: 'ab'.repeat(20),
    });
    expect(seen[0].url).toBe('https://api.github.com/repos/acme/widgets/pulls/4/merge');
    expect(seen[0].opts.method).toBe('PUT');
    expect(seen[0].opts.headers.Authorization).toBe('Bearer test-token');
    expect(seen[0].url).not.toMatch(/git\/refs|force/);
  });
});

describe('kraken re-check', () => {
  function fakeSpawn(code) {
    return () => ({
      stdout: { on() {} },
      stderr: { on() {} },
      on(event, fn) {
        if (event === 'close') queueMicrotask(() => fn(code));
        return this;
      },
    });
  }

  test('a deleted source repo is not treated as this repo', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        number: 4,
        title: 'from a fork',
        draft: false,
        mergeable: true,
        user: { login: 'builder' },
        head: { sha: SHA, repo: null },
        base: { ref: 'master', repo: { full_name: REPO } },
        html_url: 'https://github.com/acme/widgets/pull/4',
      }),
      text: async () => '',
    });
    const loaded = await createGitHub(fetchImpl).loadPull({ token: 't', repo: REPO, number: 4 });
    expect(loaded.fork).toBe(true);
  });

  test('a renamed file keeps both names, and a symlink or a cut-off tree is not trusted', async () => {
    const fetchImpl = async (url) => {
      let body;
      if (url.includes('/pulls/4/files')) {
        body = [{ filename: 'notes/095-x.txt', previous_filename: 'docker/095-x.sql', status: 'renamed' }];
      } else if (url.includes('/git/trees/')) {
        body = {
          truncated: false,
          tree: [
            { path: 'notes/095-x.txt', mode: '120000' },
            { path: 'docker/095-x.sql', mode: '100644' },
          ],
        };
      } else if (url.includes('/git/commits/')) body = { tree: { sha: 'abc' } };
      else body = { base: { sha: 'base' }, head: { sha: 'head' } };
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    };
    const names = await createGitHub(fetchImpl).files({ token: 't', repo: REPO, number: 4 });
    expect(names).toEqual([{
      filename: 'notes/095-x.txt',
      previous_filename: 'docker/095-x.sql',
      mode: '120000',
      previousMode: '100644',
      untrusted: false,
    }]);
    const missing = async (url) => {
      let body = { base: { sha: 'base' }, head: { sha: 'head' } };
      if (url.includes('/pulls/4/files')) body = [{ filename: 'src/components/Ok.jsx', status: 'modified' }];
      else if (url.includes('/git/commits/head')) body = { tree: { sha: 'new-tree' } };
      else if (url.includes('/git/commits/')) body = { tree: { sha: 'old-tree' } };
      else if (url.includes('/git/trees/new-tree')) body = { truncated: false, tree: [] };
      else if (url.includes('/git/trees/')) body = { truncated: false, tree: [{ path: 'src/components/Ok.jsx', mode: '100644' }] };
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    };
    const gone = await createGitHub(missing).files({ token: 't', repo: REPO, number: 4 });
    expect(gone[0]).toMatchObject({ filename: 'src/components/Ok.jsx', mode: '', previousMode: '100644', untrusted: true });
    const cut = async (url) => {
      let body = { base: { sha: 'base' }, head: { sha: 'head' } };
      if (url.includes('/pulls/4/files')) body = [{ filename: 'README.md', status: 'modified' }];
      else if (url.includes('/git/trees/')) body = { truncated: true, tree: [] };
      else if (url.includes('/git/commits/')) body = { tree: { sha: 'abc' } };
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    };
    await expect(createGitHub(cut).files({ token: 't', repo: REPO, number: 4 })).rejects.toMatchObject({ code: 'github-truncated' });
  });

  test('a comment list that does not end is not trusted', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => Array.from({ length: 100 }, () => ({ body: 'x', user: { login: 'a' }, created_at: 't' })),
      text: async () => '',
    });
    await expect(createGitHub(fetchImpl).comments({ token: 't', repo: REPO, number: 4 }))
      .rejects.toMatchObject({ code: 'github-truncated' });
  });

  test('a passing check is clean and a failing check is not', async () => {
    expect(await runKrakenLock(9, { spawnImpl: fakeSpawn(0), token: 't', repo: 'acme/widgets' })).toEqual({ ok: true });
    expect(await runKrakenLock(9, { spawnImpl: fakeSpawn(1) })).toEqual({ ok: false });
    expect(await runKrakenLock(9, { spawnImpl: () => { throw new Error('missing'); } })).toEqual({ ok: false });
  });
});
