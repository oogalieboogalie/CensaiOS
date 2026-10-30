import { onLogRecord } from '../logger.js';
import { scrubText, scrubStack } from './scrub.js';

/**
 * Self-fix: a short, already-scrubbed tail of recent server log lines, so an
 * error report carries what happened just before the error, not the whole log.
 */

const MAX_LINES = 400;
const lines = [];
let detach = null;

function metaText(meta) {
  if (meta === undefined) return '';
  if (meta instanceof Error) return ` ${meta.message}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return '';
  }
}

export function recordLine(record) {
  const text = `${record.time} ${String(record.level).toUpperCase()} [${record.namespace}] ${record.message}${metaText(record.meta)}`;
  lines.push(scrubText(text, 600));
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}

/** The last `count` lines, oldest first. */
export function recentLines(count = 40) {
  return lines.slice(-count);
}

export function clearLines() {
  lines.length = 0;
}

/**
 * Start keeping the tail, and call `onError` for every error-level record
 * (except self-fix's own, so a broken fixer never reports itself in a loop).
 */
export function watchServerLog(onError) {
  detach?.();
  detach = onLogRecord((record) => {
    // The app's own repeated asks, answered (boot/requestLog.js logs them at
    // debug), would push what happened before an error out of the tail.
    if (record.namespace === 'http' && record.level === 'debug') return;
    recordLine(record);
    // Copied console lines and the board's own errors (server/appLog/) are
    // kept in the tail but are not reports: the board reports its own.
    if (record.level !== 'error' || /^(self-fix|console|browser)/.test(String(record.namespace))) return;
    const meta = record.meta;
    const err = meta instanceof Error ? meta : meta?.error instanceof Error ? meta.error : null;
    const detail = err ? err.message : typeof meta?.error === 'string' ? meta.error : '';
    onError({
      kind: 'server-error',
      source: 'server',
      message: `[${record.namespace}] ${record.message}${detail ? `: ${detail}` : ''}`,
      stack: err ? scrubStack(err.stack) : '',
      area: record.namespace,
    });
  });
  return detach;
}
