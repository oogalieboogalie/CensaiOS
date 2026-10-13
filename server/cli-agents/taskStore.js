import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { createLogger } from '../logger.js';

/**
 * Task state for the Agent Console: the in-memory task map, the transcript
 * item helpers (every change bumps a revision so the console can poll with
 * `since=<rev>`), read views, and persistence to .homebase-state/cli-agents
 * so a restart keeps the transcript. A task that was running when the
 * server stopped comes back as "stopped" and can be resumed.
 */

const log = createLogger('cli-agents');

const MAX_ITEMS = 600;
const MAX_SAVED_TASKS = 60;
export const RUNNING = new Set(['installing', 'starting', 'running', 'needs_approval']);

export function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export class TaskStore extends EventEmitter {
  constructor({ stateFile = null } = {}) {
    super();
    this.tasks = new Map();
    this.stateFile = stateFile;
    this.saveTimer = null;
  }

  // ── persistence ────────────────────────────────────────────────────────
  load() {
    if (!this.stateFile) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      for (const task of Array.isArray(saved.tasks) ? saved.tasks : []) {
        if (RUNNING.has(task.status)) {
          task.status = 'stopped';
          for (const p of task.permissions || []) if (p.status === 'pending') p.status = 'cancelled';
          this.addItemTo(task, { id: `note-restart-${task.rev + 1}`, kind: 'note', text: 'Homebase restarted while this task was running. Send a follow-up to resume it.' });
        }
        this.tasks.set(task.id, task);
      }
    } catch {
      /* first run or unreadable file: start empty */
    }
  }

  scheduleSave() {
    if (!this.stateFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 800);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (!this.stateFile) return;
    try {
      const tasks = [...this.tasks.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_SAVED_TASKS)
        .map((t) => ({ ...t, raw: (t.raw || []).slice(-80) }));
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      const tmp = `${this.stateFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, tasks }), 'utf8');
      fs.renameSync(tmp, this.stateFile);
    } catch (err) {
      log.warn('could not save cli agent tasks', { error: err.message });
    }
  }

  // ── transcript helpers ─────────────────────────────────────────────────
  touch(task) {
    task.rev += 1;
    task.updatedAt = Date.now();
    this.scheduleSave();
    this.emit('task', task.id);
    return task.rev;
  }

  addItemTo(task, item) {
    task.rev += 1;
    task.items.push({ ...item, rev: task.rev, at: Date.now() });
    if (task.items.length > MAX_ITEMS) task.items.splice(0, task.items.length - MAX_ITEMS);
  }

  addItem(task, item) {
    const existing = task.items.find((i) => i.id === item.id);
    if (existing) return this.updateItem(task, item.id, item);
    this.addItemTo(task, item);
    task.updatedAt = Date.now();
    this.scheduleSave();
    this.emit('task', task.id);
    return undefined;
  }

  updateItem(task, id, patch) {
    const item = task.items.find((i) => i.id === id);
    if (!item) return;
    Object.assign(item, patch, { rev: this.touch(task) });
  }

  setStatus(task, status) {
    if (task.status === status) return;
    task.status = status;
    if (!RUNNING.has(status)) task.finishedAt = Date.now();
    this.touch(task);
  }

  // ── public reads ───────────────────────────────────────────────────────
  get(id) {
    const task = this.tasks.get(String(id || ''));
    if (!task) throw httpError('No task with that id.', 404);
    return task;
  }

  summary(task) {
    const { items: _items, raw: _raw, prompt: _prompt, permissions, ...meta } = task;
    return {
      ...meta,
      pendingApprovals: (permissions || []).filter((p) => p.status === 'pending').length,
      running: RUNNING.has(task.status),
    };
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt).map((t) => this.summary(t));
  }

  snapshot(id, since = 0) {
    const task = this.get(id);
    const after = Number(since) || 0;
    return {
      task: { ...this.summary(task), prompt: task.prompt },
      items: task.items.filter((i) => i.rev > after),
      permissions: task.permissions,
      rev: task.rev,
    };
  }

  raw(id) {
    return this.get(id).raw || [];
  }

  permissions({ status = 'pending' } = {}) {
    const out = [];
    for (const task of this.tasks.values()) {
      for (const p of task.permissions || []) {
        if (!status || p.status === status) out.push({ ...p, taskId: task.id, cli: task.cli, cliLabel: task.cliLabel, taskTitle: task.title });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }

  runningCount() {
    return [...this.tasks.values()].filter((t) => RUNNING.has(t.status)).length;
  }
}
