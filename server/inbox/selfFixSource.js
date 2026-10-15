// The self-fixing error reports (server/selfFix) as an Inbox source. Only
// the owner sees them (the same rule as /api/self-fix), and only where the
// app can touch its own files. Reports already fixed, undone or landed stay
// in Settings, not in the Inbox.

import { registerInboxSource } from './sources.js';

const OPEN = new Set(['saved', 'failed', 'fixing']);
const HOUR = 60 * 60 * 1000;

let loader = async () => (await import('../selfFix/index.js')).getSelfFix();
export function setSelfFixLoader(fn) { loader = fn; }

export function selfFixReport(r, now = Date.now()) {
  return {
    id: r.id,
    title: r.title || r.message || 'Error',
    detail: [r.note, r.windowKind && `In the ${r.windowKind} window.`, r.message !== r.title && r.message].filter(Boolean).join(' '),
    count: r.count || 1,
    // The store keeps a count and the last time, not each hit.
    lastHour: now - (r.lastSeen || 0) < HOUR ? null : 0,
    firstSeen: new Date(r.firstSeen || now).toISOString(),
    lastSeen: new Date(r.lastSeen || now).toISOString(),
    repo: r.source === 'server' ? 'censaiOS server' : 'this board',
    fixing: r.status === 'fixing',
    fixable: r.status === 'saved' || r.status === 'failed',
  };
}

export function registerSelfFixSource() {
  return registerInboxSource('self-fix', {
    async list({ isOwner, localFiles }) {
      if (!isOwner || !localFiles || process.env.CENSAI_SELF_FIX === 'off') return [];
      const selfFix = await loader();
      return selfFix.store.list().filter((r) => OPEN.has(r.status)).map((r) => selfFixReport(r));
    },
    async fix({ isOwner, localFiles, reportId }) {
      if (!isOwner || !localFiles) throw Object.assign(new Error('Only the owner can send errors to Claude Code, on the desktop app.'), { status: 403 });
      const selfFix = await loader();
      const report = selfFix.store.get(reportId);
      if (!report) throw Object.assign(new Error('That report is gone.'), { status: 404 });
      if (!['saved', 'failed', 'undone'].includes(report.status)) throw Object.assign(new Error('That report is already being handled.'), { status: 409 });
      selfFix.store.update(report.id, { status: 'saved', fix: null });
      const started = await selfFix.maybeFix(selfFix.store.get(report.id), { manual: true });
      const after = selfFix.store.get(report.id);
      return { started, text: started ? 'Claude Code is fixing it. The fix applies the next time censaiOS starts.' : (after?.note || 'Saved; no fix was started.') };
    },
  });
}
