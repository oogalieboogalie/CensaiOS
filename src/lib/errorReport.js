// Errors a window shows: one line in plain words, a short snippet of what
// happened (for the "Details" fold), and a hand-off to an agent chat so
// Claude can look into it. The snippet goes through the same secret scrub as
// self-fix reports, so keys, tokens and emails never show or leave.
import { scrubText } from '../../server/selfFix/scrubText.js';
import { recentActions } from './selfFix/reporter.js';
import { useWorkspaceStore } from './store.js';

/** An Error from a failed /api call that remembers what was asked and why it was refused. */
export function apiError(res, data, fallback, { method = 'GET', path = '' } = {}) {
  const error = new Error(data?.error || fallback || `Request failed (${res?.status})`);
  return Object.assign(error, {
    status: res?.status ?? null,
    code: data?.code || null,
    reason: data?.reason || null,
    method: String(method).toUpperCase(),
    path: String(path).replace(/\?.*$/, ''),
    at: new Date().toISOString(),
  });
}

/** The one line a person reads first. */
export function plainWords(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const { status, reason, code } = error;
  if (reason === 'owner-only' || code === 'computer_owner_only') {
    return "This needs this computer's owner account, and you're signed in with a different account.";
  }
  if (status === 401) return "You're signed out. Sign in again, then try once more.";
  if (status >= 500 && !error.message) return 'censaiOS hit a problem on its side while doing this.';
  if (error.name === 'TypeError' && /fetch|network/i.test(error.message)) {
    return "censaiOS couldn't be reached. It may still be starting.";
  }
  return error.message || 'Something went wrong.';
}

function clock(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 19);
}

/** A short, scrubbed log of the error and the last few steps before it. */
export function buildErrorSnippet(error, { where = '', actions = recentActions(), steps = 8, logLines = [] } = {}) {
  const e = typeof error === 'string' ? { message: error } : (error || {});
  const plain = plainWords(e);
  const lines = [`What happened: ${plain}`];
  if (e.message && e.message !== plain) lines.push(`Message: ${e.message}`);
  if (e.path) lines.push(`Request: ${e.method || 'GET'} ${e.path} -> ${e.status ?? '?'}${e.reason ? ` (${e.reason})` : ''}`);
  if (where) lines.push(`Where: ${where}`);
  lines.push(`When: ${(e.at || new Date().toISOString()).replace('T', ' ').slice(0, 19)} UTC`);
  // Background polling (a GET that worked) is noise; keep clicks, keys and anything that changed or failed.
  const recent = actions.filter((a) => !(a.type === 'request' && /^GET .* [23]\d\d$/.test(a.label))).slice(-steps);
  if (recent.length) {
    lines.push('Last steps:');
    for (const a of recent) lines.push(`  ${clock(a.at)} ${a.type} ${a.label}${a.windowKind ? ` [${a.windowKind}]` : ''}`);
  }
  if (logLines.length) {
    lines.push('censaiOS log (warnings and errors, last 10 minutes):');
    for (const l of logLines) lines.push(`  ${l}`);
  }
  return scrubText(lines.join('\n'), logLines.length ? 6000 : 2400);
}

/**
 * The warnings and errors censaiOS wrote down in the last few minutes (GET
 * /api/logs/recent). Empty when the log can't be read: the snippet works without it.
 */
export async function fetchLogLines({ minutes = 10, lines = 15, fetcher = typeof fetch === 'function' ? fetch : null } = {}) {
  if (!fetcher) return [];
  try {
    const res = await fetcher(`/api/logs/recent?level=warn&minutes=${minutes}&lines=${lines}`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.lines) ? data.lines.slice(-lines) : [];
  } catch {
    return [];
  }
}

/** What Claude is asked, with the snippet filled in. */
export function claudeAsk(snippet) {
  return [
    'Something went wrong in censaiOS. Please look into it: tell me in plain words what caused it and what to do about it, and fix it if you can. If you can use read_app_log, read the log around this time first.',
    '',
    '```',
    snippet,
    '```',
  ].join('\n');
}

/**
 * Open a chat with Censai (the board's main agent) with the error already
 * sent, and log it to the Inbox's board errors too.
 */
export function sendErrorToClaude(error, { where = '', agentId = 'censai', store = useWorkspaceStore, logLines = [] } = {}) {
  const snippet = buildErrorSnippet(error, { where, logLines });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('censai:board-error', { detail: { message: plainWords(error), detail: snippet } }));
  }
  store.getState().spawnAt('chat', {
    agentId,
    title: 'Look into this error',
    msgs: [{ from: 'me', text: claudeAsk(snippet) }],
    autoSend: true,
  });
  return snippet;
}
