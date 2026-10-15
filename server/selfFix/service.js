import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger.js';
import { RUNNING } from '../cli-agents/taskStore.js';
import { buildBundle, bundleText } from './bundle.js';
import { buildWorkOrder, readVerdict, looksExternal } from './workOrder.js';
import { decidePermission } from './policy.js';
import { linkNodeModules, unlinkNodeModules, verifyFix } from './verify.js';
import { queuePatch, queueDir, applyPending, undoPatch, patchState } from './patches.js';

/**
 * Self-fix: when censaiOS hits an error, a headless Claude Code run on the
 * owner's own computer tries to fix it, and the fix waits for the next start.
 *
 *   capture  error -> scrubbed bundle -> one report per distinct error
 *   fix      new report + switch on + under today's cap -> Claude Code in its
 *            own worktree (the Agent Console machinery), no approval pop-ups:
 *            policy.js answers its permission questions
 *   check    our own Jest run on the files it changed (verify.js)
 *   deliver  passing fix -> patch queued (patches.js) -> applied at next start;
 *            failing fix -> the report stays in Settings for a person
 */

const log = createLogger('self-fix');
const MAX_QUEUE = 5;
const STATUS_FOR_PATCH = { pending: 'ready', applied: 'applied', landed: 'landed', undone: 'undone' };

export class SelfFix {
  constructor({ store, tasks, repoRoot, appRoot = null, readiness, runAs = async () => null, logLines = () => [], isOwnerPc = () => true, env = process.env }) {
    Object.assign(this, { store, tasks, repoRoot, appRoot, readiness, runAs, logLines, isOwnerPc, env });
    this.active = null; // { reportId, taskId }
    this.queue = [];
    this.watching = false;
  }

  /** Is auto-fix on, and if not, why (plain words for Settings). */
  async state() {
    const setting = this.store.settings.autoFix;
    const base = { setting, dailyCap: this.store.settings.dailyCap, runsToday: this.store.runsToday(), repo: Boolean(this.repoRoot) };
    if (!this.repoRoot) return { ...base, on: false, why: 'This copy of censaiOS is not a git folder, so it only saves reports.' };
    if (!this.isOwnerPc()) return { ...base, on: false, why: 'Fixes only run on the owner\'s own computer. Reports are saved.' };
    // Opt-in: nothing changes the code until the owner turns the switch on once.
    if (setting !== true) return { ...base, on: false, why: 'Off. Reports are saved; turn it on to let Claude Code fix them by itself.' };
    const ready = await this.readiness().catch(() => ({ ok: false }));
    if (!ready.ok) return { ...base, on: false, cliReady: false, why: 'Claude Code is not installed and signed in on this computer yet, so it only saves reports.' };
    return { ...base, on: true, cliReady: true, why: null };
  }

  capture(input, { canFix = true } = {}) {
    if (this.capturing) return null;
    this.capturing = true;
    try {
      const bundle = buildBundle(input, { logLines: input.source === 'server' ? this.logLines() : this.logLines().slice(-20) });
      const { report, isNew } = this.store.record(bundle);
      if (isNew && !canFix) {
        this.store.update(report.id, { note: 'Reported from a teammate\'s screen. Saved for the owner to look at; "Try to fix it" sends it to Claude Code.' });
      } else if (isNew && looksExternal(bundle)) {
        this.store.update(report.id, { note: 'Caused by something outside the code (network, a key, the disk), so no fix was tried.' });
      } else if (isNew) {
        this.maybeFix(report).catch((err) => log.warn('could not start a fix', { error: err.message }));
      }
      return report;
    } finally {
      this.capturing = false;
    }
  }

  async maybeFix(report, { manual = false } = {}) {
    const state = await this.state();
    if (!state.on && !(manual && state.cliReady !== false && this.repoRoot && this.isOwnerPc())) {
      this.store.update(report.id, { note: state.why });
      return false;
    }
    if (!this.store.canRunToday()) {
      this.store.update(report.id, { note: `Today's limit of ${this.store.settings.dailyCap} fixes is used up, so this one was saved for later.` });
      return false;
    }
    if (this.active) {
      if (this.queue.length >= MAX_QUEUE || this.queue.includes(report.id)) return false;
      this.queue.push(report.id);
      this.store.update(report.id, { note: 'Waiting for the fix before it to finish.' });
      return true;
    }
    await this.startFix(report);
    return true;
  }

  watch() {
    if (this.watching) return;
    this.watching = true;
    this.tasks.on('permission', ({ taskId, request }) => {
      if (this.active?.taskId !== taskId) return;
      const task = this.tasks.get(taskId);
      const decision = decidePermission(request, task.worktree.dir);
      try {
        this.tasks.decide(taskId, request.id, { allow: decision.allow, message: decision.message, user: { name: 'Self-fix' } });
      } catch (err) {
        log.warn('could not answer a permission request', { error: err.message });
      }
    });
    this.tasks.on('task', (taskId) => {
      if (this.active?.taskId !== taskId || this.active.finishing) return;
      const task = this.tasks.tasks.get(taskId);
      if (task && !RUNNING.has(task.status)) {
        this.active.finishing = true;
        this.finish(this.active.reportId, task).catch((err) => log.warn('could not finish a fix', { error: err.message })).finally(() => this.next());
      }
    });
  }

  async startFix(report) {
    this.watch();
    this.store.countRun();
    this.store.update(report.id, { status: 'fixing', note: 'Claude Code is working on a fix.', fix: { startedAt: Date.now() } });
    this.active = { reportId: report.id, taskId: null };
    try {
      const userId = await this.runAs();
      const task = await this.tasks.start({
        cli: 'claudecode', folder: this.repoRoot, prompt: buildWorkOrder(report.bundle),
        title: `Self-fix: ${report.title}`, user: { userId, name: 'Self-fix' },
        prepare: (dir) => linkNodeModules(dir, [this.repoRoot, this.appRoot]),
      });
      this.active.taskId = task.id;
      this.store.updateFix(report.id, { taskId: task.id });
      log.info('started a fix', { report: report.id, task: task.id });
      const live = this.tasks.tasks.get(task.id);
      if (live && !RUNNING.has(live.status)) this.tasks.emit('task', task.id);
    } catch (err) {
      this.store.update(report.id, { status: 'failed', note: `The fix could not start: ${err.message}` });
      this.active = null;
      this.next();
    }
  }

  async finish(reportId, task) {
    const fail = (note, extra = {}) => {
      this.store.update(reportId, { status: 'failed', note });
      this.store.updateFix(reportId, { finishedAt: Date.now(), ...extra });
    };
    const dir = task.worktree?.dir;
    try {
      const verdict = readVerdict(task.summary);
      const changes = await this.tasks.changes(task.id).catch(() => ({ files: [], patch: '' }));
      const files = changes.files.filter((f) => f.path !== 'node_modules');
      const base = { summary: verdict.sentence, files: files.map((f) => f.path) };
      if (task.status !== 'done') return fail(`The fix run ended early (${task.status}). The report is saved.`, base);
      if (!verdict.fixed) return fail(verdict.sentence || 'Claude Code could not find a safe fix. The report is saved.', base);
      if (!files.length) return fail('Claude Code said it was fixed but changed no files, so nothing was kept.', base);
      if (changes.truncated) return fail('The fix was too large to apply automatically.', base);
      const check = await verifyFix({ worktreeDir: dir, files, env: this.env });
      if (!check.ok) return fail('The fix did not pass its tests, so it was not kept.', { ...base, verify: check });
      queuePatch(this.repoRoot, reportId, changes.patch);
      this.writeReceipt(reportId, { verdict, files, check });
      this.store.update(reportId, { status: 'ready', note: 'Fixed. Applies next time censaiOS starts.', seen: {} });
      this.store.updateFix(reportId, { ...base, verify: check, finishedAt: Date.now(), costUsd: task.costUsd ?? null });
      log.info('fix ready for next start', { report: reportId, files: base.files.length, tests: check.tests });
    } finally {
      if (dir) unlinkNodeModules(dir);
    }
  }

  next() {
    this.active = null;
    const id = this.queue.shift();
    const report = id && this.store.get(id);
    if (report && report.status === 'saved') this.maybeFix(report).catch(() => {});
    else if (id) this.next();
  }

  /** Receipt next to the patch: what broke, what changed, how it was checked. */
  writeReceipt(id, { verdict, files, check }) {
    const report = this.store.get(id);
    try {
      const file = path.join(queueDir(this.repoRoot), '..', 'receipts', `${id}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, [
        `# Self-fix ${id}`, '', `Fixed: ${verdict.sentence || report.title}`, `When: ${new Date().toISOString()}`,
        `Files: ${files.map((f) => f.path).join(', ')}`, `Check: ${check.ran ? `${check.tests} related tests passed` : check.output}`,
        '', '## Error report', '', '```', bundleText(report.bundle), '```', '',
      ].join('\n'));
    } catch { /* the patch itself is the important part */ }
  }

  /** At start: put waiting fixes into the code, then match reports to where their patch is. */
  async boot({ apply = true } = {}) {
    if (!this.repoRoot) return [];
    const results = apply ? await applyPending(this.repoRoot, this.env).catch(() => []) : [];
    for (const report of this.store.list()) {
      if (!report.fix || report.status === 'fixing') continue;
      const where = patchState(this.repoRoot, report.id);
      const status = where && STATUS_FOR_PATCH[where];
      if (!status || status === report.status) continue;
      if (status === 'applied') this.store.updateFix(report.id, { appliedAt: Date.now() });
      this.store.update(report.id, { status, note: status === 'applied' ? 'Fixed and in use.' : report.note });
    }
    for (const r of results.filter((x) => x.result === 'conflict')) {
      this.store.update(r.id, { note: 'This fix no longer fits the latest censaiOS, so it is waiting. Undo drops it.' });
    }
    return results;
  }

  async undo(id) {
    const report = this.store.get(id);
    if (!report?.fix) throw Object.assign(new Error('Nothing to undo for that report.'), { statusCode: 404 });
    const { result } = await undoPatch(this.repoRoot, id, this.env);
    this.store.updateFix(id, { undoneAt: Date.now() });
    this.store.update(id, { status: 'undone', note: result === 'reversed' ? 'Undone. The old code is back after the next start.' : 'Undone before it was applied.' });
    return this.store.get(id);
  }
}
