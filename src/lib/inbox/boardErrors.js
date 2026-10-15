// Errors this browser has hit, grouped by message, for the Inbox window.
// Starts listening the first time anything imports it; the main boot file
// imports it so errors from before the Inbox opened are counted too.
// Nothing leaves the browser from here: the Inbox reads it locally.

const MAX = 30;
const HOUR = 60 * 60 * 1000;
const reports = new Map(); // key → { id, title, detail, hits: [ms], firstSeen }
const listeners = new Set();
let installed = false;

// Quiet noise that is not a bug in the board.
const IGNORE = /ResizeObserver loop|Script error\.?$|AbortError|The user aborted/i;

function keyOf(message) {
  return String(message || 'Unknown error').replace(/\d{3,}/g, '#').slice(0, 160);
}

export function recordBoardError(message, detail = '', now = Date.now()) {
  const text = String(message || '').trim();
  if (!text || IGNORE.test(text)) return null;
  const key = keyOf(text);
  let report = reports.get(key);
  if (!report) {
    if (reports.size >= MAX) reports.delete(reports.keys().next().value);
    report = { id: key, title: text.slice(0, 140), detail: String(detail || '').slice(0, 600), hits: [], firstSeen: now };
    reports.set(key, report);
  }
  report.hits.push(now);
  if (report.hits.length > 500) report.hits.splice(0, report.hits.length - 500);
  if (detail && !report.detail) report.detail = String(detail).slice(0, 600);
  for (const fn of listeners) fn();
  return report;
}

/** The reports in the shape errorItem() (src/lib/inbox/errorItem.js) expects. */
export function boardErrorReports(now = Date.now()) {
  return [...reports.values()].map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    count: r.hits.length,
    lastHour: r.hits.filter((t) => now - t < HOUR).length,
    firstSeen: new Date(r.firstSeen).toISOString(),
    lastSeen: new Date(r.hits[r.hits.length - 1]).toISOString(),
    users: 1,
    source: 'board',
    repo: 'this board',
  }));
}

export function onBoardErrors(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearBoardErrors() {
  reports.clear();
  for (const fn of listeners) fn();
}

export function installBoardErrorCapture(target = typeof window !== 'undefined' ? window : null) {
  if (installed || !target) return;
  installed = true;
  target.addEventListener('error', (e) => {
    const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '';
    recordBoardError(e.message || e.error?.message, [where, e.error?.stack].filter(Boolean).join('\n'));
  });
  target.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    recordBoardError(reason?.message || String(reason), reason?.stack || '');
  });
  // Other parts of the board (the self-fixing error reports, error boundaries)
  // can hand an error to the Inbox without a page-level throw.
  target.addEventListener('censai:board-error', (e) => {
    recordBoardError(e.detail?.message, e.detail?.detail || e.detail?.stack || '');
  });
}
