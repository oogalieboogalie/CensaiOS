import crypto from 'crypto';
import { scrubText } from './scrubText.js';

/**
 * Self-fix: strip secrets and personal data out of an error report before it
 * is saved or handed to a coding agent.
 *
 * Keys, tokens, emails, long ids and anything that looks like file contents
 * never leave here. What stays is what a developer needs: the message with
 * the secrets cut out, the stack, and the shape of what happened.
 */

export { scrubText, scrubStack } from './scrubText.js';

/** Recent actions (clicks, API calls): short labels only, never typed text. */
export function scrubActions(actions, max = 20) {
  if (!Array.isArray(actions)) return [];
  return actions.slice(-max).map((a) => ({
    at: Number(a?.at) || null,
    type: scrubText(a?.type, 24),
    label: scrubText(a?.label, 80),
    windowKind: a?.windowKind ? scrubText(a.windowKind, 40) : null,
  }));
}

/**
 * Same error, same fingerprint: the message with numbers and ids flattened,
 * plus the first few frames of the stack by file and function (not line,
 * so an unrelated edit above it does not make it look new).
 */
export function fingerprint({ kind = '', message = '', stack = '', path: apiPath = '' }) {
  const normalized = String(message)
    .replace(/^(Uncaught\s+)?(\w*Error:\s*)?/, '')
    .replace(/\[(key|token|email|hex|blob|redacted)\]/g, '')
    .replace(/\b[0-9a-f]{6,}\b/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/(["'`]).*?\1/g, '$1…$1')
    .slice(0, 200);
  const frames = String(stack).split('\n').slice(1)
    .map((l) => l.replace(/:\d+(:\d+)?\)?\s*$/, '').replace(/\?[^\s)]*/, '').replace(/^\s*at\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const route = String(apiPath).replace(/\/\d+(?=\/|$)/g, '/#').replace(/\?.*$/, '');
  // A window crash also reaches the page as an uncaught error: one report, not two.
  const group = kind === 'api-failed' ? 'api' : 'error';
  return crypto.createHash('sha1').update([group, normalized, route, ...frames].join('|')).digest('hex').slice(0, 16);
}
