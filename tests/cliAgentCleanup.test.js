/**
 * Agent Console tidy-up: where installs and logins live (they must survive
 * a Docker rebuild), process groups (Stop ends what the agent started), the
 * idle watchdog, and the 14-day / orphan worktree cleanup that saves the
 * changes as a patch before removing anything. Uses the stand-in CLI.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CliTaskManager } from '../server/cli-agents/taskManager.js';
import { buildAgentEnv } from '../server/cli-agents/env.js';
import { cliDataRoot, agentHome, inContainer } from '../server/cli-agents/paths.js';
import { managedPrefix } from '../server/cli-agents/install.js';
import { worktreeRoot } from '../server/cli-agents/worktrees.js';
import { IDLE_MS, KEEP_MS, ORPHAN_GRACE_MS } from '../server/cli-agents/cleanup.js';
import { LOCAL_STATE_DIR } from '../server/routes/files/pathUtils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STANDIN = path.join(here, 'fixtures', 'cli-agents', 'standin-agent.mjs');
const LIVE = new Set(['installing', 'starting', 'running', 'needs_approval']);
const posix = process.platform !== 'win32';

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

function manager(extra = {}, opts = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    CENSAI_CLI_CLAUDECODE_BIN: STANDIN,
    CENSAI_CLI_CODEX_BIN: STANDIN,
    CENSAI_WORKTREE_DIR: path.join(tmp, 'worktrees'),
    STANDIN_DELAY_MS: '5',
    CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_DELAY_MS,STANDIN_SCRIPT',
    ...extra,
  };
  return new CliTaskManager({ env, archiveDir: path.join(tmp, 'archive'), install: async () => { throw new Error('no installs'); }, ...opts });
}

async function settle(m, id, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = m.get(id);
    for (const p of task.permissions) if (p.status === 'pending') m.decide(id, p.id, { allow: true });
    if (!LIVE.has(task.status)) return task;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`task ${id} did not finish`);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(fn, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fn();
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-cleanup-'));
  repo = makeRepo();
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('where the Agent Console keeps things', () => {
  test('outside Docker: ~/.censai and the person’s own home, as before', () => {
    const env = { PATH: '/bin' };
    expect(inContainer(env)).toBe(false);
    expect(cliDataRoot(env)).toBe(path.join(os.homedir(), '.censai'));
    expect(managedPrefix(env)).toBe(path.join(os.homedir(), '.censai', 'cli-agents'));
    expect(worktreeRoot(env)).toBe(path.join(os.homedir(), '.censai', 'worktrees'));
    expect(agentHome(env)).toBeNull();
  });

  test('in Docker: everything lives in the state volume, so it survives a rebuild', () => {
    const env = { CENSAI_IN_CONTAINER: '1' };
    const root = path.join(LOCAL_STATE_DIR, 'cli-agents');
    expect(cliDataRoot(env)).toBe(root);
    expect(managedPrefix(env)).toBe(path.join(root, 'cli-agents'));
    expect(worktreeRoot(env)).toBe(path.join(root, 'worktrees'));
    expect(agentHome(env)).toBe(path.join(root, 'home'));
    // The compose file's project-root variable counts too.
    expect(inContainer({ HOMEBASE_CONTAINER_PROJECT_ROOT: '/workspace/CensaiHub' })).toBe(true);
  });

  test('a private home replaces HOME and the XDG folders in the CLI’s environment', () => {
    const env = buildAgentEnv({
      source: { PATH: '/bin', HOME: '/root', XDG_CONFIG_HOME: '/root/.config', USE_BUILTIN_RIPGREP: '0' },
      home: '/state/home',
    });
    expect(env.HOME).toBe('/state/home');
    expect(env.XDG_CONFIG_HOME).toBeUndefined();
    expect(env.USE_BUILTIN_RIPGREP).toBe('0');
  });

  test('the CLI really runs with the private home', async () => {
    const home = path.join(tmp, 'agent-home');
    const out = path.join(tmp, 'seen-home.txt');
    const script = path.join(tmp, 'home-script.json');
    fs.writeFileSync(script, JSON.stringify([{ bash: `node -e "require('fs').writeFileSync(process.argv[1], require('os').homedir())" ${out}` }, { say: 'ok' }]));
    const m = manager({ CENSAI_CLI_AGENT_HOME: home, STANDIN_SCRIPT: script });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'where is home' });
    expect((await settle(m, started.id)).status).toBe('done');
    expect(fs.readFileSync(out, 'utf8')).toBe(home);
    expect(fs.existsSync(home)).toBe(true);
  });
});

(posix ? describe : describe.skip)('ending what an agent started', () => {
  test('a background command the agent left running is ended when its turn ends', async () => {
    const pidFile = path.join(tmp, 'bg.pid');
    const script = path.join(tmp, 'bg-script.json');
    fs.writeFileSync(script, JSON.stringify([{ bash: `sleep 300 >/dev/null 2>&1 & echo $! > ${pidFile}` }, { say: 'left a server running' }]));
    const m = manager({ STANDIN_SCRIPT: script });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'start a server' });
    expect((await settle(m, started.id)).status).toBe('done');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(await waitFor(() => !alive(pid))).toBe(true);
  });

  test('Stop ends the agent and its commands; stopAll does the same on shutdown', async () => {
    const pidFile = path.join(tmp, 'stop.pid');
    const script = path.join(tmp, 'stop-script.json');
    fs.writeFileSync(script, JSON.stringify([{ bash: `sleep 300 >/dev/null 2>&1 & echo $! > ${pidFile}` }, { say: 'working' }, { say: 'still working' }]));
    const m = manager({ STANDIN_SCRIPT: script, STANDIN_DELAY_MS: '600' });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'slow' });
    expect(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim())).toBeTruthy();
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    m.stopAll();
    const task = await settle(m, started.id);
    expect(task.status).toBe('stopped');
    expect(await waitFor(() => !alive(pid))).toBe(true);
  });
});

describe('cleanup', () => {
  test('an agent with no output for 30 minutes is stopped', async () => {
    const m = manager({ STANDIN_DELAY_MS: '2000' });
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'hang' });
    await waitFor(() => m.get(started.id).status === 'running');
    m.stopStuck(Date.now() + IDLE_MS + 1000);
    const task = await settle(m, started.id);
    expect(task.status).toBe('stopped');
    expect(task.items.some((i) => /30 minutes with no output/.test(i.text || ''))).toBe(true);
  });

  test('14 days after a task ran: changes saved as a patch, worktree and branch removed', async () => {
    const m = manager();
    const started = await m.start({ cli: 'claudecode', folder: repo, prompt: 'Add notes' });
    const task = await settle(m, started.id);
    expect(fs.existsSync(task.worktree.dir)).toBe(true);

    await m.sweep(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(fs.existsSync(task.worktree.dir)).toBe(true); // too soon

    await m.sweep(Date.now() + KEEP_MS + 60_000);
    expect(fs.existsSync(task.worktree.dir)).toBe(false);
    expect(git(['branch', '--list', task.worktree.branch], repo).trim()).toBe('');
    expect(task.worktreeRemoved).toBe(true);
    expect(fs.readFileSync(task.archivedPatch, 'utf8')).toContain('+Added by the stand-in agent.');
    expect(task.items.at(-1).text).toMatch(/Cleaned up 14 days after it last ran/);
    await expect(m.followUp(task.id, { prompt: 'more' })).rejects.toMatchObject({ statusCode: 410 });
    // Removing it from the list still works once the worktree is gone.
    await m.discard(task.id);
    expect(m.list().some((t) => t.id === task.id)).toBe(false);
  });

  test('a worktree no task knows about is saved and removed after an hour', async () => {
    const root = path.join(tmp, 'worktrees');
    const dir = path.join(root, 'leftover-repo', 'abc123');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(['worktree', 'add', '-q', '-b', 'censai/codex-abc123', dir, 'HEAD'], repo);
    fs.writeFileSync(path.join(dir, 'half-done.txt'), 'work in progress\n');
    const m = manager();

    await m.sweep(Date.now());
    expect(fs.existsSync(dir)).toBe(true); // could belong to a task starting right now

    await m.sweep(Date.now() + ORPHAN_GRACE_MS + 60_000);
    expect(fs.existsSync(dir)).toBe(false);
    expect(git(['branch', '--list', 'censai/codex-abc123'], repo).trim()).toBe('');
    const saved = fs.readdirSync(path.join(tmp, 'archive')).find((f) => f.includes('abc123'));
    expect(fs.readFileSync(path.join(tmp, 'archive', saved), 'utf8')).toContain('+work in progress');
  });

  test('a task’s own worktree is never treated as leftover', async () => {
    const m = manager();
    const started = await m.start({ cli: 'codex', folder: repo, prompt: 'x' });
    const task = await settle(m, started.id);
    await m.sweep(Date.now() + ORPHAN_GRACE_MS + 60_000);
    expect(fs.existsSync(task.worktree.dir)).toBe(true);
  });
});
