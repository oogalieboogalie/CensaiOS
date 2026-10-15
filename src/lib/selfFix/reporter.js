/**
 * Self-fix, browser side: quietly send an error report to this computer's
 * censaiOS when something breaks (a crash page, an uncaught error, a failed
 * /api call). The server scrubs it again and decides what to do with it.
 *
 * Only labels go out: the error, its stack, the window kind, and the last
 * few clicks and requests. Never typed text, form values or file contents.
 */

const MAX_ACTIONS = 20;
const SAME_ERROR_GAP_MS = 60_000;
const actions = [];
const lastSent = new Map();
let installed = false;
let realFetch = null;

function windowKindOf(el) {
  const frame = el?.closest?.('[data-win-kind]');
  return frame ? frame.getAttribute('data-win-kind') : null;
}

function labelOf(el) {
  const target = el?.closest?.('button,a,[role="button"],[role="menuitem"],[role="tab"],input,select,[data-testid]') || el;
  if (!target) return 'something';
  const named = target.getAttribute?.('aria-label') || target.getAttribute?.('title') || target.getAttribute?.('data-testid');
  const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  const text = isField ? `${target.tagName.toLowerCase()} field` : (named || target.textContent || target.tagName.toLowerCase());
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function noteAction(type, label, windowKind = null) {
  actions.push({ at: Date.now(), type, label: String(label).slice(0, 80), windowKind });
  if (actions.length > MAX_ACTIONS) actions.splice(0, actions.length - MAX_ACTIONS);
}

export function recentActions() {
  return actions.slice();
}

/** Send one report. Same error twice within a minute is sent once. */
export function reportError({ kind, error, message, windowKind = null, componentStack = null, method, path, status }) {
  if (typeof window === 'undefined' || !realFetch) return;
  const text = String(message || error?.message || error || 'Unknown error');
  const key = `${kind}|${text}|${path || ''}`;
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < SAME_ERROR_GAP_MS) return;
  lastSent.set(key, now);
  const body = {
    kind, message: text.slice(0, 1000), stack: String(error?.stack || '').slice(0, 6000),
    windowKind, componentStack: componentStack ? String(componentStack).slice(0, 3000) : null,
    method, path, status, page: window.location.pathname, actions: recentActions(),
  };
  realFetch('/api/self-fix/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
  }).catch(() => { /* reporting must never cause another error */ });
}

function watchFetch() {
  const original = window.fetch;
  window.fetch = async function selfFixFetch(input, init) {
    const response = await original.call(this, input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (path.startsWith('/api/') && !path.startsWith('/api/self-fix')) {
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        noteAction('request', `${method} ${path.replace(/\?.*$/, '')} ${response.status}`);
        if (response.status >= 500) reportError({ kind: 'api-failed', message: `${method} ${path.replace(/\?.*$/, '')} returned ${response.status}`, method, path, status: response.status });
      }
    } catch { /* never get in the way of the request */ }
    return response;
  };
}

/** Call once at startup (main.jsx), after any fetch rewriting. */
export function installSelfFixReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  realFetch = window.fetch.bind(window);
  window.addEventListener('click', (e) => noteAction('click', labelOf(e.target), windowKindOf(e.target)), { capture: true, passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$|^Escape$/.test(e.key)) {
      noteAction('key', [e.ctrlKey && 'Ctrl', e.metaKey && 'Cmd', e.altKey && 'Alt', e.key].filter(Boolean).join('+'), windowKindOf(e.target));
    }
  }, { capture: true, passive: true });
  window.addEventListener('error', (e) => {
    if (!e.error && !e.message) return;
    reportError({ kind: 'browser-error', error: e.error, message: e.message, windowKind: windowKindOf(document.activeElement) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    reportError({ kind: 'unhandled-rejection', error: reason instanceof Error ? reason : null, message: reason?.message || String(reason) });
  });
  watchFetch();
}
