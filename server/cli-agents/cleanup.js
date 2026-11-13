import fs from 'fs';
import path from 'path';
import { execFile, spawnSync } from 'child_process';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { RUNNING } from './taskStore.js';
import { killTree } from './runProcess.js';

/**
 * Keeping the Agent Console tidy without anyone pressing anything.
 * Mixed into CliTaskManager (taskManager.js); `sweep()` runs on a timer.
 *
 * - An agent that has printed nothing for 30 minutes, or has waited 2 hours
 *   for an approval nobody gave, is stopped so it stops holding one of the
 *   four slots (a follow-up resumes it).
 * - A finished task's worktree (and its censai/* branch in the repo) is
 *   removed 14 days after it last ran. Its changes are saved first as a
 *   .patch file, so nothing is ever thrown away silently.
 * - Only the newest 60 tasks are kept; older ones are cleaned up the same way.
 * - Worktree folders no task knows about (left by a crash or an old copy of
 *   the app) are saved and removed after an hour.
 * - On shutdown every running agent and everything it started is ended.
 */

const log = createLogger('cli-agents-cleanup');

export const IDLE_MS = 30 * 60 * 1000;
export const APPROVAL_WAIT_MS = 2 * 60 * 60 * 1000;
export const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_KEPT_TASKS = 60;
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const MAX_ARCHIVES = 200;

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
}

export const cleanupMethods = {
  /** Save a worktree's uncommitted changes as a patch. Returns the file or null. */
  async archiveChanges(name, dir, baseSha = 'HEAD') {
    if (!this.archiveDir || !fs.existsSync(dir)) return null;
    let patch = '';
    try {
      if (baseSha === 'HEAD') {
        await git(['add', '--intent-to-add', '.'], dir).catch(() => {});
        patch = await git(['diff', '--binary', 'HEAD'], dir);
      } else {
        patch = (await this.wt.changes({ dir, baseSha })).patch;
      }
    } catch {
      return null;
    }
    if (!patch.trim()) return null;
    fs.mkdirSync(this.archiveDir, { recursive: true });
    const file = path.join(this.archiveDir, `${name}.patch`);
    fs.writeFileSync(file, patch, 'utf8');
    this.trimArchive();
    return file;
  },

  trimArchive() {
    try {
      const files = fs.readdirSync(this.archiveDir).filter((f) => f.endsWith('.patch'))
        .map((f) => ({ f, at: fs.statSync(path.join(this.archiveDir, f)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const { f } of files.slice(MAX_ARCHIVES)) fs.rmSync(path.join(this.archiveDir, f), { force: true });
    } catch { /* best effort */ }
  },

  /** Remove a finished task's worktree and branch, keeping its transcript. */
  async cleanUpTask(task, reason) {
    if (task.worktreeRemoved || RUNNING.has(task.status)) return false;
    const saved = await this.archiveChanges(`${task.cli}-${task.id}`, task.worktree.dir, task.baseSha).catch(() => null);
    await this.wt.removeWorktree({ repoRoot: task.repoRoot, dir: task.worktree.dir, branch: task.worktree.branch });
    task.worktreeRemoved = true;
    task.archivedPatch = saved;
    this.addItemTo(task, {
      id: `cleanup-${task.rev + 1}`,
      kind: 'note',
      text: `${reason} Its working copy was removed${saved ? `; the changes were saved to ${saved}` : ' (it had no changes)'}.`,
    });
    this.touch(task);
    log.info('cleaned up cli agent task', { id: task.id, saved: Boolean(saved) });
    return true;
  },

  /** Stop agents that went quiet or wait on an approval nobody is giving. */
  stopStuck(now = Date.now()) {
    for (const [id, rt] of this.runtime) {
      const task = this.tasks.get(id);
      if (!task) continue;
      const idle = now - (rt.lastActivity || now);
      const waiting = task.status === 'needs_approval';
      if (idle < (waiting ? APPROVAL_WAIT_MS : IDLE_MS)) continue;
      this.addItemTo(task, {
        id: `stuck-${task.turns}`,
        kind: 'note',
        text: waiting ? 'Stopped after waiting 2 hours for an approval.' : 'Stopped after 30 minutes with no output.',
      });
      this.stop(id);
    }
  },

  async removeOrphans(now = Date.now()) {
    if (typeof this.wt.worktreeRoot !== 'function') return;
    const root = this.wt.worktreeRoot(this.env);
    const known = new Set([...this.tasks.values()].filter((t) => !t.worktreeRemoved).map((t) => path.resolve(t.worktree.dir)));
    for (const repoDir of listDirs(root)) {
      for (const dir of listDirs(repoDir)) {
        if (known.has(path.resolve(dir))) continue;
        let mtime = now;
        try { mtime = fs.statSync(dir).mtimeMs; } catch { continue; }
        if (now - mtime < ORPHAN_GRACE_MS) continue;
        let repoRoot = null;
        let branch = null;
        try {
          const common = (await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir)).trim();
          repoRoot = path.dirname(common);
          const head = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).trim();
          if (head.startsWith('censai/')) branch = head;
        } catch { /* not a worktree any more: plain folder delete below */ }
        await this.archiveChanges(`orphan-${path.basename(repoDir)}-${path.basename(dir)}`, dir).catch(() => null);
        if (repoRoot) await this.wt.removeWorktree({ repoRoot, dir, branch });
        fs.rmSync(dir, { recursive: true, force: true });
        log.info('removed leftover cli agent worktree');
      }
      if (listDirs(repoDir).length === 0) fs.rmSync(repoDir, { recursive: true, force: true });
    }
  },

  /** One cleanup pass. Never throws. */
  async sweep(now = Date.now()) {
    try {
      this.stopStuck(now);
      const tasks = [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
      for (const [index, task] of tasks.entries()) {
        if (RUNNING.has(task.status)) continue;
        if (index >= MAX_KEPT_TASKS) {
          await this.cleanUpTask(task, 'Cleaned up to keep the newest 60 tasks.').catch(() => {});
          this.tasks.delete(task.id);
          this.scheduleSave();
        } else if (!task.worktreeRemoved && now - (task.finishedAt || task.updatedAt || now) > KEEP_MS) {
          await this.cleanUpTask(task, 'Cleaned up 14 days after it last ran.').catch(() => {});
        }
      }
      await this.removeOrphans(now);
    } catch (err) {
      log.warn('cli agent cleanup pass failed', { code: safeErrorCode(err) });
    }
  },

  /** On shutdown: end every agent and what it started, synchronously. */
  stopAll() {
    for (const [id, rt] of this.runtime) {
      rt.stopped = true;
      if (process.platform === 'win32' && rt.child.pid) {
        // The process is exiting, so wait for taskkill rather than fire and forget.
        spawnSync('taskkill', ['/pid', String(rt.child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
      } else {
        killTree(rt.child, 'SIGKILL');
      }
      const task = this.tasks.get(id);
      if (task) task.status = 'stopped';
    }
    this.saveNow();
  },
};
