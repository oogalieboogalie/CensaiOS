/**
 * Agent Console task runner, end to end with a stand-in CLI process.
 * The stand-in (tests/fixtures/cli-agents/standin-agent.mjs) speaks the
 * real headless protocols, writes real files and runs real commands, so
 * worktrees, permission round-trips, hand-offs and resume are exercised
 * for real; only the model is absent.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { CliTaskManager, buildHandoffPrompt } from '../server/cli-agents/taskManager.js';
import { buildAgentEnv, createRedactor } from '../server/cli-agents/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STANDIN = path.join(here, 'fixtures', 'cli-agents', 'standin-agent.mjs');
const LIVE = new Set(['installing', 'starting', 'running', 'needs_approval']);

let tmp;
let repo;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeRepo() {
  const dir = path.join(tmp, `repo-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir);
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo\n');
  git(['add', '.'], dir);
  git(['commit', '-qm', 'init'], dir);
  return dir;
}

function writeScript(steps) {
  const file = path.join(tmp, `script-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify(steps));
  return file;
}

function manager(extra = {}, opts = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    CENSAI_CLI_CLAUDECODE_BIN: STANDIN,
    CENSAI_CLI_CODEX_BIN: STANDIN,
    CENSAI_CLI_GEMINI_BIN: STANDIN,
    CENSAI_WORKTREE_DIR: path.join(tmp, 'worktrees'),
    STANDIN_DELAY_MS: '5',
    CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_DELAY_MS,STANDIN_SCRIPT',
    ...extra,
  };
  return new CliTaskManager({ env, install: async () => { throw new Error('no installs in tests'); }, ...opts });
}

async function settle(m, id, { onPermission, timeoutMs = 15000 } = {}) {
  const seen = new Set();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = m.get(id);
    for (const p of task.permissions) {
      if (p.status === 'pending' && !seen.has(p.id) && onPermission) {
        seen.add(p.id);
        m.decide(id, p.id, { allow: onPermission(p), user: { name: 'alex' } });
      }
    }
    if (!LIVE.has(task.status)) return task;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`task ${id} did not finish (status ${m.get(id).status})`);
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-agents-'));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  repo = makeRepo();
});

describe('CliTaskManager', () => {
  test('Claude Code task: typed transcript, allow card, worktree diff, summary', async () => {
    const m = manager();
    const started = await m.start({ cli: 'claudecode', folder: repo, prompt: 'Add notes', user: { name: 'alex' } });
    const task = await settle(m, started.id, { onPermission: () => true });

    expect(task.status).toBe('done');
    expect(task.summary).toBe('Done: added AGENT_NOTES.md.');
    expect(task.costUsd).toBeCloseTo(0.0123);
    expect(task.sessionId).toMatch(/^standin-/);
    expect(task.worktree.dir.startsWith(path.join(tmp, 'worktrees'))).toBe(true);
    expect(task.worktree.branch).toBe(`censai/claudecode-${task.id}`);

    const kinds = task.items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['prompt', 'thinking', 'message', 'read', 'edit', 'command']));
    const edit = task.items.find((i) => i.kind === 'edit');
    expect(edit).toMatchObject({ path: 'AGENT_NOTES.md', status: 'ok', permission: { status: 'allowed', decidedBy: 'alex' } });
    expect(edit.diff.after).toContain('Added by the stand-in agent.');

    const changes = await m.changes(task.id);
    expect(changes.files).toEqual([expect.objectContaining({ path: 'AGENT_NOTES.md', change: 'added', additions: 3 })]);
    expect(changes.patch).toContain('+Added by the stand-in agent.');
    // The repo the user is working in is untouched.
    expect(fs.existsSync(path.join(repo, 'AGENT_NOTES.md'))).toBe(false);
    expect(m.readFile(task.id, 'AGENT_NOTES.md')).toContain('# Notes');
    expect(() => m.readFile(task.id, '../../etc/passwd')).toThrow(/outside/);
  });

  test('denied steps do not run', async () => {
    const m = manager();
    const started = await m.start({ cli: 'claudecode', folder: repo, prompt: 'Add notes' });
    const task = await settle(m, started.id, { onPermission: (p) => p.tool !== 'Write' });
    const edit = task.items.find((i) => i.kind === 'edit');
    expect(edit.status).toBe('error');
    expect(edit.permission.status).toBe('denied');
    expect((await m.changes(task.id)).files).toEqual([]);
    expect(m.permissions({ status: 'denied' })[0]).toMatchObject({ taskId: task.id, cli: 'claudecode' });
  });

  test('server secrets stay out of the CLI and keys are redacted from the transcript', async () => {
    const script = writeScript([
      { bash: 'echo "db=${DATABASE_URL:-none} key=$ANTHROPIC_API_KEY"' },
      { say: 'ok' },
    ]);
    const m = manager({ DATABASE_URL: 'postgres://secret', STANDIN_SCRIPT: script }, {
      resolveKey: async () => ({ key: 'sk-ant-test-0123456789', source: 'vault' }),
    });
    const started = await m.start({ cli: 'claudecode', folder: repo, prompt: 'show env' });
    const task = await settle(m, started.id, { onPermission: () => true });
    const cmd = task.items.find((i) => i.kind === 'command');
    expect(cmd.output).toContain('db=none');
    expect(cmd.output).toContain('key=[key hidden]');
    expect(JSON.stringify(task)).not.toContain('sk-ant-test-0123456789');
    expect(m.raw(task.id).join('\n')).not.toContain('sk-ant-test-0123456789');
    expect(task.keySource).toBe('vault');
  });

  test('hand-off: Codex starts from Claude Code\u2019s changes with its summary and diff', async () => {
    const script = writeScript({
      match: { review: [{ read: 'AGENT_NOTES.md' }, { say: 'Reviewed: looks fine.' }] },
      default: [{ write: 'AGENT_NOTES.md', content: '# Notes\n' }, { say: 'Added notes.' }],
    });
    const m = manager({ STANDIN_SCRIPT: script });
    const first = await m.start({ cli: 'claudecode', folder: repo, prompt: 'Add notes' });
    await settle(m, first.id, { onPermission: () => true });

    const handed = await m.handoff(first.id, { cli: 'codex', user: { name: 'alex' } });
    const review = await settle(m, handed.id);

    expect(review.cli).toBe('codex');
    expect(review.handoffFrom).toMatchObject({ taskId: first.id, cliLabel: 'Claude Code' });
    expect(review.prompt).toContain('Review the changes Claude Code made');
    expect(review.prompt).toContain('Its summary:\nAdded notes.');
    expect(review.prompt).toContain('AGENT_NOTES.md (added');
    expect(review.prompt).toContain('```diff');
    // The source task's change is already in the reviewer's worktree.
    expect(fs.readFileSync(path.join(review.worktree.dir, 'AGENT_NOTES.md'), 'utf8')).toBe('# Notes\n');
    expect(review.summary).toBe('Reviewed: looks fine.');
    expect(review.items.find((i) => i.kind === 'command').output).toContain('# Notes');
    expect(review.status).toBe('done');
  });

  test('follow-up resumes the same CLI session in the same worktree', async () => {
    const m = manager();
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'first' });
    const first = await settle(m, started.id);
    const sessionId = first.sessionId;
    await m.followUp(first.id, { prompt: 'second', user: { name: 'sam' } });
    const second = await settle(m, first.id);
    expect(second.turns).toBe(2);
    expect(second.sessionId).toBe(sessionId);
    expect(second.items.filter((i) => i.kind === 'prompt').map((i) => [i.text, i.by])).toEqual([['first', 'You'], ['second', 'sam']]);
  });

  test('stop ends a running task and it can be resumed later', async () => {
    const m = manager({ STANDIN_DELAY_MS: '400' });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'slow' });
    await new Promise((r) => setTimeout(r, 300));
    m.stop(started.id);
    const task = await settle(m, started.id);
    expect(task.status).toBe('stopped');
    expect(task.items.some((i) => i.kind === 'note' && /Stopped/.test(i.text))).toBe(true);
  });

  test('a failing CLI shows its stderr as an error and the task fails', async () => {
    const m = manager({ STANDIN_FAIL: '1', CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_FAIL' });
    const started = await m.start({ cli: 'gemini', folder: repo, prompt: 'x' });
    const task = await settle(m, started.id);
    expect(task.status).toBe('failed');
    expect(task.items.find((i) => i.kind === 'error').text).toContain('simulated failure');
  });

  test('a missing CLI installs on first use, then runs', async () => {
    let installed = false;
    const install = jest.fn(async () => { installed = true; });
    const m = manager({}, {
      install,
      resolveLaunch: () => (installed ? { command: process.execPath, prefixArgs: [STANDIN], source: 'managed' } : null),
    });
    const started = await m.start({ cli: 'gemini', folder: repo, prompt: 'x' });
    const task = await settle(m, started.id);
    expect(install).toHaveBeenCalledWith('gemini');
    expect(task.items.some((i) => i.kind === 'note' && /Installing it for you/.test(i.text))).toBe(true);
    expect(task.status).toBe('done');
  });

  test('two tasks on one repo work in separate worktrees at once', async () => {
    const m = manager();
    const [a, b] = await Promise.all([
      m.start({ cli: 'codex', folder: repo, prompt: 'a' }),
      m.start({ cli: 'gemini', folder: repo, prompt: 'b' }),
    ]);
    expect(m.get(a.id).worktree.dir).not.toBe(m.get(b.id).worktree.dir);
    await Promise.all([settle(m, a.id), settle(m, b.id)]);
    expect(git(['worktree', 'list'], repo).split('\n').filter(Boolean)).toHaveLength(3);
    await m.discard(a.id);
    expect(git(['worktree', 'list'], repo).split('\n').filter(Boolean)).toHaveLength(2);
    expect(() => m.get(a.id)).toThrow(/No task/);
  });

  test('transcripts survive a restart; a task that was running comes back stopped', async () => {
    const stateFile = path.join(tmp, `state-${Date.now()}.json`);
    const m = manager({}, { stateFile });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'persist me' });
    await settle(m, started.id);
    m.get(started.id).status = 'running';
    m.saveNow();
    const reloaded = manager({}, { stateFile });
    const task = reloaded.get(started.id);
    expect(task.status).toBe('stopped');
    expect(task.items.some((i) => /Homebase restarted/.test(i.text || ''))).toBe(true);
    expect(reloaded.snapshot(started.id, task.rev - 1).items).toHaveLength(1);
  });

  test('rejects bad input with plain messages', async () => {
    const m = manager();
    await expect(m.start({ cli: 'cursor', folder: repo, prompt: 'x' })).rejects.toThrow(/Pick Claude Code/);
    await expect(m.start({ cli: 'codex', folder: repo, prompt: '  ' })).rejects.toThrow(/Type a task/);
    const plain = fs.mkdtempSync(path.join(tmp, 'plain-'));
    await expect(m.start({ cli: 'codex', folder: plain, prompt: 'x' })).rejects.toThrow(/not a git repo/);
  });
});

describe('agent environment', () => {
  test('starts from an allowlist, adds only the CLI key', () => {
    const env = buildAgentEnv({
      source: { PATH: '/bin', HOME: '/h', DATABASE_URL: 'x', SESSION_SECRET: 'y', OPENAI_API_KEY: 'server-key' },
      key: 'user-key', keyEnv: 'ANTHROPIC_API_KEY',
    });
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'user-key' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  test('redactor hides keys and ignores short values', () => {
    const redact = createRedactor(['sk-abcdefgh123', 'abc']);
    expect(redact('key sk-abcdefgh123 and abc')).toBe('key [key hidden] and abc');
  });

  test('hand-off prompt lists files and fences the diff', () => {
    const prompt = buildHandoffPrompt({
      source: { cliLabel: 'Claude Code', title: 'Add x', summary: 'Added x' },
      ask: 'Review it.',
      files: [{ path: 'x.js', change: 'added', additions: 2, deletions: 0 }],
      patch: '+x',
    });
    expect(prompt.split('\n')[0]).toBe('Review it.');
    expect(prompt).toContain('- x.js (added, +2 -0)');
    expect(prompt).toContain('```diff\n+x\n```');
  });
});
