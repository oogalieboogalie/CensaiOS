/**
 * Minimal structured logger for the server.
 *
 * Why this exists (and not raw console.log): every log line gets a timestamp,
 * a level, and a namespace, so output is greppable and filterable; levels are
 * gated by LOG_LEVEL so prod stays quiet and dev is verbose; and metadata
 * objects are redacted so we never print tokens/passwords. It still writes to
 * the console and, by default, a daily JSONL file under .homebase-state/logs.
 *
 *   import { createLogger } from './logger.js';
 *   const log = createLogger('terminal');
 *   log.info('connection open', { backend });
 *   const done = log.startTimer();
 *   ... ; log.info('did thing', { ms: done() });
 *
 * Control with LOG_LEVEL=error|warn|info|debug|trace (default: debug in dev,
 * info otherwise). LOG_TIMESTAMPS=false to drop timestamps.
 */
import fs from 'fs';
import { getLogFilePath, LOG_CONFIG } from './logRetention.js';
import { scrubText } from './selfFix/scrubText.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const configuredLevel = (process.env.LOG_LEVEL || DEFAULT_LEVEL).toLowerCase();
const activeLevel = LEVELS[configuredLevel] ?? LEVELS[DEFAULT_LEVEL];
const showTimestamps = process.env.LOG_TIMESTAMPS !== 'false';

const SENSITIVE_KEY = /(authorization|api[_-]?key|secret|token|password|passwd|cookie|session)/i;
let currentLogDate = null;
let currentLogStream = null;

// Kept from before server/appLog/consoleCapture.js wraps console, so the
// logger's own lines go to the file once, not again through the capture.
const CONSOLE_FOR_LEVEL = {
  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: console.log,
  trace: console.log,
};

/** Redact obviously-sensitive values in a shallow metadata object. */
export function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function formatMeta(meta) {
  if (meta === undefined) return '';
  if (meta instanceof Error) return ` ${meta.stack || meta.message}`;
  try {
    return ` ${JSON.stringify(redact(meta))}`;
  } catch {
    return ' [unserializable meta]';
  }
}

let fileBroken = false;

function getLogStream(now = new Date()) {
  if (!LOG_CONFIG.fileEnabled || fileBroken) return null;
  const dateKey = now.toISOString().slice(0, 10);
  if (currentLogStream && currentLogDate === dateKey) return currentLogStream;

  currentLogStream?.end?.();
  try {
    fs.mkdirSync(LOG_CONFIG.dir, { recursive: true });
  } catch (err) {
    // A log folder we can't make must never take the app down with it.
    fileBroken = true;
    console.warn(`WARN  [logger] no log file: ${LOG_CONFIG.dir} could not be made (${err.message})`);
    return null;
  }
  currentLogDate = dateKey;
  currentLogStream = fs.createWriteStream(getLogFilePath(now), { flags: 'a' });
  currentLogStream.on('error', (err) => {
    console.warn(`WARN  [logger] file logging disabled after write error ${err.message}`);
    currentLogStream = null;
  });
  return currentLogStream;
}

// The file is what agents read when asked about a bug, so keys, tokens,
// emails and account names are cut out of every line before it is written.
function scrubRecord(record) {
  const out = { ...record, message: scrubText(record.message, 4000) };
  if (record.meta !== undefined) {
    try {
      out.meta = JSON.parse(scrubText(JSON.stringify(record.meta), 8000));
    } catch {
      out.meta = scrubText(JSON.stringify(record.meta), 8000);
    }
  }
  return out;
}

function writePersistentLog(record) {
  const stream = getLogStream(new Date(record.time));
  if (!stream) return;
  stream.write(`${JSON.stringify(scrubRecord(record))}\n`);
}

/**
 * Add a line to the log file that did not come from createLogger: plain
 * console output (server/appLog/consoleCapture.js) and the board's own
 * errors and warnings (POST /api/logs/browser). Listeners see it too.
 */
export function writeLogRecord({ level = 'info', namespace = 'console', message = '', meta, time } = {}) {
  const record = { time: time || new Date().toISOString(), level, namespace, message: String(message) };
  if (meta !== undefined) record.meta = redact(meta);
  notify(level, namespace, record.message, meta);
  if (process.env.NODE_ENV === 'test') return;
  writePersistentLog(record);
}

// Listeners see every record before the level gate (self-fix keeps a short
// tail of recent lines for error reports). A listener can never break logging.
const listeners = new Set();
export function onLogRecord(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(level, namespace, message, meta) {
  if (!listeners.size) return;
  const record = { time: new Date().toISOString(), level, namespace, message, meta };
  for (const fn of listeners) {
    try { fn(record); } catch { /* never let a listener break logging */ }
  }
}

function emit(level, namespace, message, meta) {
  notify(level, namespace, message, meta);
  if (process.env.NODE_ENV === 'test') return;
  if (LEVELS[level] > activeLevel) return;
  const time = new Date().toISOString();
  const safeMeta = redact(meta);
  const ts = showTimestamps ? `${time} ` : '';
  const line = `${ts}${level.toUpperCase().padEnd(5)} [${namespace}] ${message}${formatMeta(meta)}`;
  (CONSOLE_FOR_LEVEL[level] || console.log)(line);
  writePersistentLog({ time, level, namespace, message, ...(safeMeta !== undefined ? { meta: safeMeta } : {}) });
}

export function createLogger(namespace) {
  const logger = {
    error: (msg, meta) => emit('error', namespace, msg, meta),
    warn: (msg, meta) => emit('warn', namespace, msg, meta),
    info: (msg, meta) => emit('info', namespace, msg, meta),
    debug: (msg, meta) => emit('debug', namespace, msg, meta),
    trace: (msg, meta) => emit('trace', namespace, msg, meta),
    /** Returns a function that yields elapsed milliseconds since the call. */
    startTimer: () => {
      const start = Date.now();
      return () => Date.now() - start;
    },
    /** Create a sub-namespaced child logger, e.g. log.child('worker'). */
    child: (sub) => createLogger(`${namespace}:${sub}`),
  };
  return logger;
}

export const logger = createLogger('app');
export { activeLevel as logLevel, configuredLevel as logLevelName };
