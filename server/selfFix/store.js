import fs from 'fs';
import path from 'path';

/**
 * Self-fix state: one report per distinct error (same fingerprint = same
 * report, its count goes up), the owner's switch, and today's run count.
 * Saved as one small JSON file in the app's state folder.
 *
 * Report status, in plain words:
 *   saved    the report is kept; no fix was tried (switch off, cap reached…)
 *   fixing   a coding agent is working on it now
 *   ready    fixed and checked; applies next time censaiOS starts
 *   applied  the fix is in
 *   failed   the agent could not fix it; the report stays for a person
 *   undone   someone pressed Undo
 *   landed   the same fix is already in the latest censaiOS
 */

const MAX_REPORTS = 200;
export const DEFAULT_DAILY_CAP = 3;

function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export class SelfFixStore {
  constructor({ file = null, now = () => Date.now() } = {}) {
    this.file = file;
    this.now = now;
    this.reports = new Map();
    this.settings = { autoFix: null, dailyCap: DEFAULT_DAILY_CAP };
    this.runs = { day: today(now()), count: 0 };
    this.load();
  }

  load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const r of saved.reports || []) {
        // A fix that was running when the app stopped did not finish.
        if (r.status === 'fixing') Object.assign(r, { status: 'failed', note: 'censaiOS closed while the fix was running.' });
        this.reports.set(r.id, r);
      }
      this.settings = { ...this.settings, ...(saved.settings || {}) };
      if (saved.runs?.day) this.runs = saved.runs;
    } catch { /* first run */ }
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, settings: this.settings, runs: this.runs, reports: this.list() }, null, 1));
      fs.renameSync(tmp, this.file);
    } catch { /* state folder not writable: keep going in memory */ }
  }

  list() {
    return [...this.reports.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  get(id) {
    return this.reports.get(String(id || '')) || null;
  }

  /** Add an error. Returns { report, isNew }. */
  record(bundle) {
    const at = this.now();
    const existing = this.reports.get(bundle.fingerprint);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = at;
      // Keep the most telling version: a window crash names its window.
      if (bundle.windowKind || !existing.bundle?.windowKind) {
        Object.assign(existing, { kind: bundle.kind, title: bundle.title, windowKind: bundle.windowKind || existing.windowKind, bundle });
      }
      this.save();
      return { report: existing, isNew: false };
    }
    const report = {
      id: bundle.fingerprint, kind: bundle.kind, source: bundle.source, title: bundle.title,
      message: bundle.message, area: bundle.area || null, windowKind: bundle.windowKind || null,
      status: 'saved', note: null, count: 1, firstSeen: at, lastSeen: at, bundle, fix: null, seen: {},
    };
    this.reports.set(report.id, report);
    this.trim();
    this.save();
    return { report, isNew: true };
  }

  update(id, patch) {
    const report = this.get(id);
    if (!report) return null;
    Object.assign(report, patch);
    this.save();
    return report;
  }

  updateFix(id, patch) {
    const report = this.get(id);
    if (!report) return null;
    report.fix = { ...(report.fix || {}), ...patch };
    this.save();
    return report;
  }

  trim() {
    if (this.reports.size <= MAX_REPORTS) return;
    const drop = this.list().reverse().filter((r) => !['fixing', 'ready', 'applied'].includes(r.status));
    for (const r of drop.slice(0, this.reports.size - MAX_REPORTS)) this.reports.delete(r.id);
  }

  /** Fix runs today, and whether another one fits under the cap. */
  runsToday() {
    const day = today(this.now());
    if (this.runs.day !== day) this.runs = { day, count: 0 };
    return this.runs.count;
  }

  canRunToday() {
    return this.runsToday() < Math.max(0, Number(this.settings.dailyCap) || 0);
  }

  countRun() {
    this.runsToday();
    this.runs.count += 1;
    this.save();
  }

  setSettings(patch) {
    if ('autoFix' in patch) this.settings.autoFix = patch.autoFix == null ? null : Boolean(patch.autoFix);
    if ('dailyCap' in patch) this.settings.dailyCap = Math.min(20, Math.max(0, Math.round(Number(patch.dailyCap) || 0)));
    this.save();
    return this.settings;
  }
}
