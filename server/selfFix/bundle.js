import { scrubText, scrubStack, scrubActions, fingerprint } from './scrub.js';

/**
 * Self-fix: turn one error (from the server log, a crash, or a browser
 * report) into a diagnostic bundle: what broke, where, the stack, the log
 * lines just before it, and the last few things the person did. Everything
 * is scrubbed (scrub.js) before it is kept.
 */

export const KINDS = new Set([
  'server-error', 'server-crash', 'window-crash', 'app-crash', 'browser-error', 'unhandled-rejection', 'api-failed',
]);

function cleanKind(kind) {
  return KINDS.has(kind) ? kind : 'browser-error';
}

function plainTitle({ kind, message, windowKind, method, path, status }) {
  const short = (text) => (text.length > 90 ? `${text.slice(0, 87)}…` : text);
  if (kind === 'window-crash' && windowKind) return `The ${windowKind} window crashed`;
  if (kind === 'app-crash') return 'censaiOS crashed while drawing the board';
  if (kind === 'api-failed') return `${method || 'GET'} ${path || 'request'} failed (${status || 'error'})`;
  if (kind === 'server-crash') return short(`The server stopped: ${message}`);
  return short(message || 'Something went wrong');
}

export function buildBundle(input = {}, { logLines = [], at = Date.now() } = {}) {
  const kind = cleanKind(input.kind);
  const message = scrubText(input.message || 'Unknown error', 600);
  const stack = scrubStack(input.stack || '');
  const path = input.path ? scrubText(String(input.path).replace(/\?.*$/, ''), 160) : null;
  const method = input.method ? String(input.method).toUpperCase().slice(0, 8) : null;
  const status = Number(input.status) || null;
  const windowKind = input.windowKind ? scrubText(input.windowKind, 40) : null;
  const area = input.area ? scrubText(input.area, 60) : null;
  return {
    fingerprint: fingerprint({ kind, message, stack, path }),
    kind,
    source: input.source === 'server' ? 'server' : 'browser',
    title: plainTitle({ kind, message, windowKind, method, path, status }),
    message,
    stack,
    area,
    windowKind,
    method,
    path,
    status,
    componentStack: input.componentStack ? scrubText(input.componentStack, 1500) : null,
    page: input.page ? scrubText(String(input.page).split('?')[0], 120) : null,
    actions: scrubActions(input.actions),
    logs: logLines.map((l) => scrubText(l, 600)),
    at,
  };
}

/** The bundle as text, the way the coding agent reads it. */
export function bundleText(bundle) {
  const lines = [
    `What broke: ${bundle.title}`,
    `Kind: ${bundle.kind} (from the ${bundle.source})`,
    `Error: ${bundle.message}`,
  ];
  if (bundle.area) lines.push(`Server area: ${bundle.area}`);
  if (bundle.windowKind) lines.push(`Window kind: ${bundle.windowKind}`);
  if (bundle.path) lines.push(`Request: ${bundle.method || 'GET'} ${bundle.path} -> ${bundle.status ?? '?'}`);
  if (bundle.page) lines.push(`Page: ${bundle.page}`);
  if (bundle.stack) lines.push('', 'Stack:', bundle.stack);
  if (bundle.componentStack) lines.push('', 'React component stack:', bundle.componentStack);
  if (bundle.actions?.length) {
    lines.push('', 'What the person did just before (oldest first):');
    for (const a of bundle.actions) lines.push(`- ${a.type}: ${a.label}${a.windowKind ? ` (in ${a.windowKind})` : ''}`);
  }
  if (bundle.logs?.length) lines.push('', 'Server log just before:', ...bundle.logs);
  return lines.join('\n');
}
