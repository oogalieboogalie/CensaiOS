/**
 * Client-side structured logger (browser console).
 *
 * Same idea as the server logger: leveled + namespaced + timestamped, so
 * console output is filterable and quiet by default in production builds.
 *
 *   import { createLogger } from '../lib/logger.js';
 *   const log = createLogger('terminal');
 *   log.info('socket open', { url });
 *
 * Level resolves from (in order): localStorage 'homebase.logLevel',
 * Vite import.meta.env.VITE_LOG_LEVEL, else 'debug' in dev / 'warn' in prod.
 * Set at runtime in devtools:  localStorage.setItem('homebase.logLevel','trace')
 */
const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

function resolveLevel() {
  try {
    const stored = typeof localStorage !== 'undefined' && localStorage.getItem('homebase.logLevel');
    if (stored && stored.toLowerCase() in LEVELS) return stored.toLowerCase();
  } catch { /* localStorage may be unavailable */ }
  const envLevel = typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOG_LEVEL;
  if (envLevel && envLevel.toLowerCase() in LEVELS) return envLevel.toLowerCase();
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
  return isDev ? 'debug' : 'warn';
}

const activeLevel = LEVELS[resolveLevel()] ?? LEVELS.warn;

const SENSITIVE_KEY = /(authorization|api[_-]?key|secret|token|password|cookie|session)/i;

function redact(value, depth = 0) {
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

const METHOD = { error: 'error', warn: 'warn', info: 'info', debug: 'log', trace: 'debug' };

function emit(level, namespace, message, meta) {
  if (LEVELS[level] > activeLevel) return;
  const prefix = `%c[${namespace}]`;
  const style = 'color:#888;font-weight:600';
  const fn = console[METHOD[level]] || console.log;
  if (meta === undefined) fn(prefix, style, message);
  else fn(prefix, style, message, redact(meta));
}

export function createLogger(namespace) {
  return {
    error: (msg, meta) => emit('error', namespace, msg, meta),
    warn: (msg, meta) => emit('warn', namespace, msg, meta),
    info: (msg, meta) => emit('info', namespace, msg, meta),
    debug: (msg, meta) => emit('debug', namespace, msg, meta),
    trace: (msg, meta) => emit('trace', namespace, msg, meta),
    startTimer: () => {
      const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      return () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start);
    },
    child: (sub) => createLogger(`${namespace}:${sub}`),
  };
}

export const logger = createLogger('app');
