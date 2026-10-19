/**
 * Plain console output (console.log and friends, not createLogger) used to
 * show only in the terminal that ran the server. On the PC the server runs
 * inside Docker with no terminal open, so those lines were only in Docker's
 * own log. This copies them into the app's log file as well, so whoever
 * looks into a bug finds them next to everything else. The console still
 * prints them as before.
 */
import util from 'util';
import { writeLogRecord } from '../logger.js';

const LEVEL_FOR = { error: 'error', warn: 'warn', info: 'info', log: 'info', debug: 'debug' };
let installed = false;

export function installConsoleCapture(target = console, write = writeLogRecord) {
  if (installed && target === console) return;
  if (target === console) installed = true;
  let busy = false;
  for (const [method, level] of Object.entries(LEVEL_FOR)) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    target[method] = function captured(...args) {
      original.apply(this, args);
      if (busy) return; // a write that itself logs must not loop
      busy = true;
      try {
        const text = util.format(...args);
        if (text.trim()) write({ level, namespace: 'console', message: text.slice(0, 8000) });
      } catch {
        // logging must never break the caller
      } finally {
        busy = false;
      }
    };
  }
}
