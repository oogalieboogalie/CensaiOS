import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { cliDataRoot } from './paths.js';
import { inHiddenFolder, isSecretFileName } from '../security/secretFiles.js';
import { FILE_PROBLEMS } from '../../shared/files/fileProblems.js';

/**
 * One git worktree per task, so two consoles can work on one repo at once
 * without stepping on each other's files.
 *
 * Worktrees live outside the repo (~/.censai/worktrees/<repo>-<hash>/<task>,
 * or the state volume in Docker)
 * so the repo's own test runner, bundler and file watchers never see a
 * second copy of the code. Nothing is committed: the task's result is the
 * worktree's uncommitted changes against the commit it started from, which
 * `changes()` reads with git (the source of truth for the files panel).
 */

const MAX_PATCH_CHARS = 400_000;

function git(args, cwd, { input, maxBuffer = 20 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd, maxBuffer, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) {
        const message = String(stderr || err.message).trim().split('\n').slice(-3).join(' ');
        reject(Object.assign(new Error(message || 'git failed'), { code: err.code }));
      } else {
        resolve(String(stdout));
      }
    });
    if (input != null) {
      child.stdin.end(input);
    }
  });
}

export function worktreeRoot(env = process.env) {
  return env.CENSAI_WORKTREE_DIR ? path.resolve(env.CENSAI_WORKTREE_DIR) : path.join(cliDataRoot(env), 'worktrees');
}

export async function resolveRepo(folder) {
  const dir = path.resolve(String(folder || ''));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw Object.assign(new Error('That folder does not exist.'), { statusCode: 400 });
  }
  let top;
  try {
    top = (await git(['rev-parse', '--show-toplevel'], dir)).trim();
  } catch {
    throw Object.assign(new Error('That folder is not a git repo. Coding agents work in a git worktree, so pick a repo (or run git init there first).'), { statusCode: 400 });
  }
  const repoRoot = path.resolve(top);
  let head = null;
  try { head = (await git(['rev-parse', 'HEAD'], repoRoot)).trim(); } catch { head = null; }
  if (!head) {
    throw Object.assign(new Error('That repo has no commits yet. Make a first commit so agents have something to branch from.'), { statusCode: 400 });
  }
  const sub = path.relative(repoRoot, dir);
  return { repoRoot, head, subdir: sub && !sub.startsWith('..') ? sub : '' };
}

function repoSlug(repoRoot) {
  const hash = crypto.createHash('sha1').update(repoRoot).digest('hex').slice(0, 8);
  return `${path.basename(repoRoot).replace(/[^A-Za-z0-9._-]/g, '-') || 'repo'}-${hash}`;
}

/**
 * Create a worktree for a task at `baseSha` on a new branch. If `patch` is
 * given (a hand-off), apply it so the new task starts from the previous
 * task's result.
 */
export async function createWorktree({ repoRoot, baseSha, taskId, cli, patch = '', env = process.env }) {
  const dir = path.join(worktreeRoot(env), repoSlug(repoRoot), taskId);
  const branch = `censai/${cli}-${taskId}`;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await git(['worktree', 'add', '-b', branch, dir, baseSha], repoRoot);
  if (patch && patch.trim()) {
    try {
      await git(['apply', '--whitespace=nowarn', '-'], dir, { input: patch });
    } catch (err) {
      throw Object.assign(new Error(`The previous task's changes did not apply cleanly: ${err.message}`), { statusCode: 409 });
    }
  }
  return { dir, branch };
}

export async function removeWorktree({ repoRoot, dir, branch }) {
  try { await git(['worktree', 'remove', '--force', dir], repoRoot); } catch { fs.rmSync(dir, { recursive: true, force: true }); }
  try { await git(['worktree', 'prune'], repoRoot); } catch { /* best effort */ }
  if (branch) {
    try { await git(['branch', '-D', branch], repoRoot); } catch { /* already gone */ }
  }
}

function parseNumstat(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [add, del, ...rest] = line.split('\t');
    const file = rest.join('\t');
    return { path: file, additions: add === '-' ? null : Number(add), deletions: del === '-' ? null : Number(del), binary: add === '-' };
  });
}

function parseStatus(text) {
  const map = new Map();
  for (const line of text.split('\n').filter(Boolean)) {
    const [code, ...rest] = line.split('\t');
    map.set(rest[rest.length - 1], code[0] === 'A' ? 'added' : code[0] === 'D' ? 'deleted' : code[0] === 'R' ? 'renamed' : 'modified');
  }
  return map;
}

/**
 * What the task changed: per-file stats and the unified patch, against the
 * commit the worktree started from. New files count (intent-to-add), and
 * the worktree's index is left as the agent had it.
 */
export async function changes({ dir, baseSha }) {
  if (!dir || !fs.existsSync(dir)) return { files: [], patch: '', truncated: false };
  await git(['add', '--intent-to-add', '.'], dir).catch(() => {});
  const [numstat, status, patch] = await Promise.all([
    git(['diff', '--numstat', baseSha], dir),
    git(['diff', '--name-status', baseSha], dir),
    // Fixed prefixes and no colours or outside diff tools, whatever the person's
    // git settings say, so diffWithoutSecrets always finds each file's name.
    git(['diff', '--binary', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', baseSha], dir),
  ]);
  const kinds = parseStatus(status);
  const files = parseNumstat(numstat).map((f) => ({ ...f, change: kinds.get(f.path) || 'modified' }));
  const truncated = patch.length > MAX_PATCH_CHARS;
  return { files, patch: truncated ? patch.slice(0, MAX_PATCH_CHARS) : patch, truncated };
}

const inside = (target, dir) => target === dir || target.startsWith(dir + path.sep);

/**
 * Read one file from a task's worktree: { content, secret }. Refuses paths
 * that escape it (a link counts where it leads) and, unless `secrets` (this
 * computer's owner is asking), a file whose name says it holds keys or
 * passwords or one in a hidden folder, as on the board; `secret` says it was one.
 */
export function readWorktreeFile(dir, rel, { secrets = false } = {}) {
  const outside = () => Object.assign(new Error('That path is outside the task’s worktree.'), { statusCode: 400 });
  const ownerOnly = () => Object.assign(new Error(FILE_PROBLEMS.ownerOnly), { statusCode: 403, reason: 'ownerOnly' });
  const kept = (file, from) => isSecretFileName(path.basename(file)) || inHiddenFolder(path.relative(from, file));
  const target = path.resolve(dir, String(rel || ''));
  if (!inside(target, dir)) throw outside();
  let secret = kept(target, dir);
  if (secret && !secrets) throw ownerOnly();
  // The native lookup also turns a Windows short name (ENV~1) into the real one.
  const realDir = fs.realpathSync.native(dir);
  const real = fs.realpathSync.native(target);
  if (!inside(real, realDir)) throw outside();
  secret ||= kept(real, realDir);
  if (secret && !secrets) throw ownerOnly();
  const stat = fs.statSync(real);
  if (stat.size > 2 * 1024 * 1024) throw Object.assign(new Error('That file is too large to open here.'), { statusCode: 413 });
  return { content: fs.readFileSync(real, 'utf8'), secret };
}
