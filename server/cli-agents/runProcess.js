import path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import { createLogger } from '../logger.js';
import { getAdapter } from './adapters/index.js';
import { parseJsonLine, clip } from './adapters/shared.js';
import { buildAgentEnv, createRedactor } from './env.js';
import { managedBinDir } from './install.js';

/**
 * Running one turn of a coding CLI: spawn it headless in the task's
 * worktree, feed every stdout line through its adapter, apply the adapter's
 * operations to the transcript, and settle the task when the process ends.
 * Mixed into CliTaskManager (taskManager.js).
 */

const log = createLogger('cli-agents');
const MAX_RAW_LINES = 400;

export const processMethods = {
  async runTurn(task, { text, user, resume }) {
    const adapter = getAdapter(task.cli);
    task.turns += 1;
    task.summary = null;
    task.finishedAt = null;
    this.addItemTo(task, { id: `prompt-${task.turns}`, kind: 'prompt', role: 'user', text, by: user.name || 'You' });
    this.setStatus(task, 'starting');

    let launch = this.resolveLaunch(adapter.id);
    if (!launch) {
      this.setStatus(task, 'installing');
      task.install = { progress: 0.02, phase: `Installing ${adapter.label}` };
      this.addItemTo(task, { id: `note-install-${task.turns}`, kind: 'note', text: `${adapter.label} is not installed yet. Installing it for you (npm ${adapter.npmPackage}).` });
      this.touch(task);
      await this.install(adapter.id);
      launch = this.resolveLaunch(adapter.id);
      task.install = null;
      if (task.status === 'stopped') return;
      if (!launch) throw new Error(`${adapter.label} installed but Homebase cannot find it.`);
    }

    const keyInfo = await this.resolveKey({ adapter, userId: user.userId }).catch(() => null);
    task.keySource = keyInfo?.source || 'cli-login';
    const env = buildAgentEnv({ source: this.env, key: keyInfo?.key || null, keyEnv: adapter.keyEnv, managedBin: managedBinDir(this.env) });
    const redact = createRedactor([keyInfo?.key]);

    const run = adapter.buildRun({ task: text, resumeSessionId: resume ? task.sessionId : null, model: task.model });
    const args = [...launch.prefixArgs, ...run.args];
    log.info('starting cli agent', { id: task.id, cli: adapter.id, resume, source: launch.source, keySource: task.keySource });

    const child = this.spawn(launch.command, args, {
      cwd: task.worktree.cwd,
      env,
      shell: Boolean(launch.shell) && !adapter.taskInArgs,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rt = { child, adapter, redact, parser: adapter.createParser(), buffer: '', stderr: '', sawDone: false, keepStdinOpen: run.keepStdinOpen, stopped: false };
    this.runtime.set(task.id, rt);
    this.setStatus(task, 'running');

    child.stdout.on('data', (chunk) => this.onStdout(task, rt, chunk));
    child.stderr.on('data', (chunk) => {
      const text = redact(chunk.toString());
      rt.stderr = (rt.stderr + text).slice(-8000);
      this.pushRaw(task, text, 'stderr');
    });
    child.on('error', (err) => this.fail(task, new Error(`${adapter.label} could not start: ${err.message}`)));
    child.on('close', (code) => this.onExit(task, rt, code));
    child.stdin.on('error', () => {});
    for (const line of run.stdin || []) child.stdin.write(`${line}\n`);
    if (!run.keepStdinOpen) child.stdin.end();
  },

  pushRaw(task, text, stream = 'stdout') {
    for (const line of String(text).split(/\r?\n/)) {
      if (!line) continue;
      task.raw.push(stream === 'stderr' ? `! ${line}` : line);
    }
    if (task.raw.length > MAX_RAW_LINES) task.raw.splice(0, task.raw.length - MAX_RAW_LINES);
  },

  onStdout(task, rt, chunk) {
    rt.buffer += rt.redact(chunk.toString());
    let nl;
    while ((nl = rt.buffer.indexOf('\n')) >= 0) {
      const line = rt.buffer.slice(0, nl);
      rt.buffer = rt.buffer.slice(nl + 1);
      this.handleLine(task, rt, line);
    }
  },

  handleLine(task, rt, line) {
    const parsed = parseJsonLine(line);
    if (!parsed) return;
    this.pushRaw(task, line);
    const ops = parsed.event ? rt.parser(parsed.event) : rt.parser(null, parsed.raw);
    for (const op of ops || []) this.applyOp(task, rt, op);
  },

  /** Show worktree paths relative to the repo, the way people read them. */
  relativize(task, obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const root = task.worktree.dir;
    const rel = (value) => (typeof value === 'string' && (value === root || value.startsWith(root + path.sep))
      ? path.relative(root, value).split(path.sep).join('/') || '.'
      : value);
    const next = { ...obj };
    for (const key of ['path', 'detail']) if (key in next) next[key] = rel(next[key]);
    if (next.diff?.path) next.diff = { ...next.diff, path: rel(next.diff.path) };
    if (typeof next.command === 'string') next.command = next.command.split(root + path.sep).join('');
    return next;
  },

  applyOp(task, rt, rawOp) {
    const op = { ...rawOp };
    if (op.item) op.item = this.relativize(task, op.item);
    if (op.patch && op.op === 'update') op.patch = this.relativize(task, op.patch);
    if (op.request) op.request = this.relativize(task, op.request);
    switch (op.op) {
      case 'meta': {
        const patch = Object.fromEntries(Object.entries(op.patch || {}).filter(([, v]) => v !== undefined));
        if (typeof patch.costDelta === 'number') {
          task.costUsd = (task.costUsd || 0) + patch.costDelta;
          delete patch.costDelta;
        }
        Object.assign(task, patch);
        this.touch(task);
        break;
      }
      case 'add':
        this.addItem(task, op.item);
        break;
      case 'upsert':
        if (task.items.some((i) => i.id === op.item.id)) this.updateItem(task, op.item.id, op.item);
        else this.addItem(task, op.item);
        break;
      case 'update':
        this.updateItem(task, op.id, op.patch);
        break;
      case 'append': {
        const item = task.items.find((i) => i.id === op.id);
        if (item) this.updateItem(task, op.id, { text: `${item.text || ''}${op.text}` });
        break;
      }
      case 'reply':
        if (rt.child.stdin.writable) rt.child.stdin.write(`${op.line}\n`);
        break;
      case 'permission': {
        // CLI request ids restart with each process, so key them by turn too.
        const request = { ...op.request, id: `t${task.turns}-${op.request.requestId}`, status: 'pending', at: Date.now(), decidedBy: null };
        const step = request.toolUseId && task.items.find((i) => i.id === request.toolUseId);
        request.itemId = step ? step.id : `perm-${request.id}`;
        task.permissions.push(request);
        if (step) {
          this.updateItem(task, step.id, { permission: { id: request.id, status: 'pending' } });
        } else {
          this.addItem(task, { id: request.itemId, kind: 'permission', permission: { id: request.id, status: 'pending' }, title: request.title, detail: request.detail, tool: request.tool, diff: request.diff || null });
        }
        this.setStatus(task, 'needs_approval');
        this.emit('permission', { taskId: task.id, request });
        break;
      }
      case 'done': {
        rt.sawDone = true;
        task.summary = op.summary || this.lastAssistantText(task) || null;
        task.lastOk = op.ok;
        if (rt.keepStdinOpen && rt.child.stdin.writable) rt.child.stdin.end();
        this.touch(task);
        break;
      }
      default:
        break;
    }
  },

  lastAssistantText(task) {
    for (let i = task.items.length - 1; i >= 0; i -= 1) {
      const item = task.items[i];
      if (item.kind === 'message' && item.role === 'assistant' && item.text?.trim()) return clip(item.text, 4000);
    }
    return null;
  },

  onExit(task, rt, code) {
    if (this.runtime.get(task.id) !== rt) return;
    if (rt.buffer.trim()) this.handleLine(task, rt, rt.buffer);
    rt.buffer = '';
    this.runtime.delete(task.id);
    for (const p of task.permissions) if (p.status === 'pending') this.closePermission(task, p, 'cancelled');
    if (rt.stopped) {
      this.setStatus(task, 'stopped');
      return;
    }
    const ok = rt.sawDone ? task.lastOk !== false : code === 0;
    if (!ok) {
      const tail = rt.stderr.trim().split('\n').slice(-6).join('\n');
      if (!rt.sawDone || tail) {
        this.addItemTo(task, { id: `exit-${task.turns}`, kind: 'error', text: tail || `${task.cliLabel} exited with code ${code}.` });
      }
    }
    if (!task.summary) task.summary = this.lastAssistantText(task);
    this.setStatus(task, ok ? 'done' : 'failed');
    log.info('cli agent finished', { id: task.id, cli: task.cli, code, ok });
  },

  fail(task, err) {
    const rt = this.runtime.get(task.id);
    if (rt) {
      rt.stopped = false;
      try { rt.child.kill('SIGKILL'); } catch { /* gone */ }
      this.runtime.delete(task.id);
    }
    task.install = null;
    this.addItemTo(task, { id: `fail-${task.rev + 1}`, kind: 'error', text: err?.message || String(err) });
    this.setStatus(task, 'failed');
  },
  closePermission(task, request, status, decidedBy = null) {
    request.status = status;
    request.decidedBy = decidedBy;
    request.decidedAt = Date.now();
    this.updateItem(task, request.itemId, { permission: { id: request.id, status, decidedBy } });
  },
};

export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32' && child.pid) {
    try { nodeSpawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); return; } catch { /* fall through */ }
  }
  try { child.kill(signal); } catch { /* already gone */ }
}
