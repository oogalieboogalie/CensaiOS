// The board's own errors and warnings, copied into censaiOS's log file
// (POST /api/logs/browser, server/routes/appLog.js) so they sit next to the
// server's lines when someone looks into a bug. The browser console used to
// be the only place they showed, and nobody had it open.
//
// Only what the board itself prints goes out: error messages, warnings and
// failed /api calls (method, path, status), never typed text or file
// contents, nor the names people gave a project's folder or a canvas group
// (shared/logs/addressNames.js). The server scrubs keys, tokens and emails
// before writing.

import { hideNamesInAddress } from '../../../shared/logs/addressNames.js';

const FLUSH_MS = 3000;
const MAX_QUEUE = 100;
const SAME_GAP_MS = 10_000;
const queue = [];
const lastSeen = new Map();
let installed = false;
let send = null;
let timer = null;

function windowKind() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return el?.closest?.('[data-win-kind]')?.getAttribute('data-win-kind') || '';
}

function text(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** console arguments as one line; drops %c styling and its CSS argument. */
export function formatArgs(args) {
  const list = [...args];
  if (typeof list[0] === 'string' && list[0].includes('%c')) {
    const styles = (list[0].match(/%c/g) || []).length;
    list[0] = list[0].replace(/%c/g, '');
    list.splice(1, styles);
  }
  return list.map(text).join(' ').trim();
}

/** Queue one line for the log. The same line twice within 10s is kept once. */
export function logToApp(level, message, { detail = '', where = windowKind(), now = Date.now() } = {}) {
  const line = String(message || '').trim();
  if (!line) return;
  const key = `${level}|${line.slice(0, 200)}`;
  if (now - (lastSeen.get(key) || 0) < SAME_GAP_MS) return;
  lastSeen.set(key, now);
  if (lastSeen.size > 300) lastSeen.delete(lastSeen.keys().next().value);
  queue.push({ level, message: line.slice(0, 2000), detail: String(detail || '').slice(0, 4000), where, time: new Date(now).toISOString() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (!timer) timer = setTimeout(flushAppLog, FLUSH_MS);
}

/**
 * A failure the board handled itself, as one fixed line: the error's kind
 * (like QuotaExceededError) goes along, never its text, which can repeat a
 * file name, a note or a server answer.
 */
export function logFailure(message, err, where, level = 'warn') {
  const kind = /^[A-Za-z]{1,40}$/.test(err?.name || '') ? err.name : '';
  logToApp(level, message, { where, detail: kind });
}

export function pendingAppLog() {
  return queue.slice();
}

export function flushAppLog() {
  timer = null;
  if (!queue.length || !send) return;
  const entries = queue.splice(0, 50);
  send('/api/logs/browser', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', keepalive: true,
    body: JSON.stringify({ entries }),
  }).catch(() => { /* the log must never cause another error */ });
  if (queue.length) timer = setTimeout(flushAppLog, FLUSH_MS);
}

function wrapConsole(target) {
  for (const level of ['error', 'warn']) {
    const original = target.console?.[level];
    if (typeof original !== 'function') continue;
    target.console[level] = function captured(...args) {
      original.apply(this, args);
      try { logToApp(level, formatArgs(args)); } catch { /* never get in the way */ }
    };
  }
}

function wrapFetch(target) {
  const original = target.fetch;
  target.fetch = async function loggedFetch(input, init) {
    const response = await original.call(this, input, init);
    try {
      const path = (typeof input === 'string' ? input : input?.url || '').replace(/^https?:\/\/[^/]+/, '');
      if (response.status >= 400 && path.startsWith('/api/') && !path.startsWith('/api/logs')) {
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        logToApp(response.status >= 500 ? 'error' : 'warn', `${method} ${hideNamesInAddress(path.replace(/\?.*$/, ''))} returned ${response.status}`);
      }
    } catch { /* never get in the way of the request */ }
    return response;
  };
}

/** Call once at startup (main.jsx), after any fetch rewriting. */
export function installBrowserLog(target = typeof window !== 'undefined' ? window : null) {
  if (installed || !target?.fetch) return;
  installed = true;
  send = target.fetch.bind(target);
  wrapConsole(target);
  wrapFetch(target);
  target.addEventListener('error', (e) => {
    if (!e.error && !e.message) return;
    const at = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '';
    logToApp('error', e.error?.message || e.message, { detail: [at, e.error?.stack].filter(Boolean).join('\n') });
  });
  target.addEventListener('unhandledrejection', (e) => {
    logToApp('error', `Unhandled: ${e.reason?.message || String(e.reason)}`, { detail: e.reason?.stack || '' });
  });
  target.addEventListener('censai:board-error', (e) => {
    logToApp('error', e.detail?.message, { detail: e.detail?.detail || e.detail?.stack || '' });
  });
  target.addEventListener('pagehide', flushAppLog);
}
