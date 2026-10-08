import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn as nodeSpawn } from 'child_process';
import { getAdapter } from './adapters/index.js';
import { clip } from './adapters/shared.js';
import { resolveCli, installCli } from './install.js';
import * as worktrees from './worktrees.js';
import { TaskStore, RUNNING, httpError } from './taskStore.js';
import { processMethods, killTree } from './runProcess.js';

/**
 * Agent Console task runner.
 *
 * A task is one coding CLI working on one request in its own git worktree.
 * The runner spawns the CLI headless, feeds every stdout line through the
 * CLI's adapter, and keeps a transcript of typed items (message, read,
 * edit, command, permission…) that the console polls with `since=<rev>`.
 * Follow-ups resume the CLI's own session in the same worktree.
 *
 * TaskStore (taskStore.js) holds state and persistence; runProcess.js runs
 * a turn of the CLI. This file is the public surface the route calls.
 */

export const MAX_RUNNING = 4;
export const MAX_PROMPT_CHARS = 20_000;

function newId() {
  return crypto.randomBytes(5).toString('hex');
}

function titleFrom(prompt) {
  const line = String(prompt || '').split('\n').map((l) => l.trim()).find(Boolean) || 'Task';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

export class CliTaskManager extends TaskStore {
  constructor({
    stateFile = null,
    spawn = nodeSpawn,
    env = process.env,
    resolveKey = async () => null,
    resolveLaunch = (id) => resolveCli(id, env),
    install = (id) => installCli(id, env),
    wt = worktrees,
  } = {}) {
    super({ stateFile });
    this.runtime = new Map(); // id → { child, parser, adapter, redact, buffer, … }
    this.spawn = spawn;
    this.env = env;
    this.resolveKey = resolveKey;
    this.resolveLaunch = resolveLaunch;
    this.install = install;
    this.wt = wt;
    this.load();
  }

  // ── starting work ──────────────────────────────────────────────────────
  async start({ cli, folder, prompt, model = null, user = {}, handoffFrom = null, patch = '', baseOverride = null }) {
    const adapter = getAdapter(cli);
    if (!adapter) throw httpError('Pick Claude Code, Codex, Gemini CLI or OpenCode.');
    const text = String(prompt || '').trim();
    if (!text) throw httpError('Type a task for the agent.');
    if (text.length > MAX_PROMPT_CHARS) throw httpError(`Keep the task under ${MAX_PROMPT_CHARS} characters.`);
    if (this.runningCount() >= MAX_RUNNING) throw httpError(`${MAX_RUNNING} agents are already working. Stop one or wait for it to finish.`, 429);

    const repo = await this.wt.resolveRepo(folder);
    const id = newId();
    const baseSha = baseOverride || repo.head;
    const worktree = await this.wt.createWorktree({ repoRoot: repo.repoRoot, baseSha, taskId: id, cli: adapter.id, patch, env: this.env });
    const cwd = repo.subdir ? path.join(worktree.dir, repo.subdir) : worktree.dir;

    const task = {
      id, cli: adapter.id, cliLabel: adapter.label, title: titleFrom(text), prompt: text,
      folder: path.resolve(String(folder)), repoRoot: repo.repoRoot, subdir: repo.subdir, baseSha,
      worktree: { dir: worktree.dir, branch: worktree.branch, cwd },
      status: 'starting', createdAt: Date.now(), updatedAt: Date.now(), finishedAt: null,
      createdBy: { userId: user.userId ?? null, name: user.name || 'You' },
      sessionId: null, model: model || null, costUsd: null, usage: null, durationMs: null, turns: 0,
      summary: null, keySource: null, gate: adapter.gate, gateNote: adapter.gateNote,
      handoffFrom, items: [], raw: [], permissions: [], rev: 0, install: null,
    };
    this.tasks.set(id, task);
    if (handoffFrom) {
      this.addItemTo(task, { id: 'handoff', kind: 'note', text: `Handed off from ${handoffFrom.cliLabel}: "${handoffFrom.title}". Its changes are applied in this worktree.` });
    }
    this.addItemTo(task, { id: 'note-worktree', kind: 'note', text: `Working in its own worktree on branch ${worktree.branch}.` });
    this.touch(task);
    this.runTurn(task, { text, user, resume: false }).catch((err) => this.fail(task, err));
    return this.summary(task);
  }

  /** Send a follow-up: resumes the CLI's own session in the same worktree. */
  async followUp(id, { prompt, user = {} }) {
    const task = this.get(id);
    const text = String(prompt || '').trim();
    if (!text) throw httpError('Type a message for the agent.');
    if (text.length > MAX_PROMPT_CHARS) throw httpError(`Keep the message under ${MAX_PROMPT_CHARS} characters.`);
    if (RUNNING.has(task.status)) throw httpError('The agent is still working. Stop it first or wait.', 409);
    if (!fs.existsSync(task.worktree.dir)) throw httpError('This task’s worktree was removed, so it cannot resume.', 410);
    if (this.runningCount() >= MAX_RUNNING) throw httpError(`${MAX_RUNNING} agents are already working.`, 429);
    this.runTurn(task, { text, user, resume: true }).catch((err) => this.fail(task, err));
    return this.summary(task);
  }

  decide(id, permissionId, { allow, user = {} }) {
    const task = this.get(id);
    const request = task.permissions.find((p) => p.id === permissionId);
    if (!request) throw httpError('No such permission request.', 404);
    if (request.status !== 'pending') throw httpError(`That request was already ${request.status}.`, 409);
    const rt = this.runtime.get(task.id);
    if (!rt || !rt.child.stdin.writable || !rt.adapter.permissionReply) {
      this.closePermission(task, request, 'cancelled');
      throw httpError('The agent is no longer waiting for this answer.', 409);
    }
    const who = user.name || 'A teammate';
    rt.child.stdin.write(`${rt.adapter.permissionReply(request, { allow: Boolean(allow), message: `${who} denied this in Homebase.` })}\n`);
    this.closePermission(task, request, allow ? 'allowed' : 'denied', who);
    if (!task.permissions.some((p) => p.status === 'pending') && task.status === 'needs_approval') this.setStatus(task, 'running');
    return request;
  }

  // ── stop / discard ─────────────────────────────────────────────────────
  stop(id) {
    const task = this.get(id);
    const rt = this.runtime.get(task.id);
    if (!rt) {
      if (RUNNING.has(task.status)) this.setStatus(task, 'stopped');
      return this.summary(task);
    }
    rt.stopped = true;
    try { rt.child.stdin.end(); } catch { /* closed */ }
    killTree(rt.child);
    const timer = setTimeout(() => killTree(rt.child, 'SIGKILL'), 3000);
    timer.unref?.();
    this.addItemTo(task, { id: `stop-${task.turns}`, kind: 'note', text: 'Stopped. Send a follow-up to resume where it left off.' });
    this.touch(task);
    return this.summary(task);
  }

  async discard(id) {
    const task = this.get(id);
    if (this.runtime.has(task.id)) this.stop(id);
    await this.wt.removeWorktree({ repoRoot: task.repoRoot, dir: task.worktree.dir, branch: task.worktree.branch });
    this.tasks.delete(task.id);
    this.scheduleSave();
    this.emit('task', task.id);
  }

  async changes(id) {
    const task = this.get(id);
    return this.wt.changes({ dir: task.worktree.dir, baseSha: task.baseSha });
  }

  readFile(id, rel) {
    const task = this.get(id);
    return this.wt.readWorktreeFile(task.worktree.dir, rel);
  }

  /**
   * Hand a finished task to another CLI: the new task starts from the same
   * commit with this task's changes applied, and its prompt carries the
   * summary and diff so "review what Claude Code did" has full context.
   */
  async handoff(id, { cli, instruction, user = {} }) {
    const source = this.get(id);
    if (RUNNING.has(source.status)) throw httpError('Let the task finish (or stop it) before handing it off.', 409);
    const { files, patch, truncated } = await this.changes(id);
    const ask = String(instruction || '').trim() || `Review the changes ${source.cliLabel} made. Point out bugs and risky spots, and fix anything clearly wrong.`;
    const prompt = buildHandoffPrompt({ source, ask, files, patch, truncated });
    return this.start({
      cli, folder: source.folder, prompt, user, patch,
      baseOverride: source.baseSha,
      handoffFrom: { taskId: source.id, cli: source.cli, cliLabel: source.cliLabel, title: source.title },
    });
  }
}

export function buildHandoffPrompt({ source, ask, files = [], patch = '', truncated = false }) {
  const list = files.length
    ? files.map((f) => `- ${f.path} (${f.change}${f.binary ? '' : `, +${f.additions} -${f.deletions}`})`).join('\n')
    : '- (no file changes)';
  const diff = clip(patch, 24_000);
  return [
    ask,
    '',
    `Context: ${source.cliLabel} worked on "${source.title}" in this repo. Its changes are already applied, uncommitted, in this folder.`,
    source.summary ? `Its summary:\n${clip(source.summary, 3000)}` : null,
    '',
    `Files changed:\n${list}`,
    patch ? `\nDiff${truncated ? ' (truncated)' : ''}:\n\`\`\`diff\n${diff}\n\`\`\`` : null,
  ].filter((part) => part != null).join('\n');
}

Object.assign(CliTaskManager.prototype, processMethods);
