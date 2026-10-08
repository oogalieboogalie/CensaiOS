// Daily background sync of the local OSV mirror.
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { syncEcosystem } from './sync.js';

const log = createLogger('osv-mirror');
const DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;
let busy = false;
let lastResult = null;

export function mirrorConfig(env = process.env) {
  const enabled = String(env.OSV_MIRROR_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  const ecosystems = String(env.OSV_MIRROR_ECOSYSTEMS || 'npm')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const intervalMs = Math.max(60 * 60 * 1000, Number(env.OSV_MIRROR_INTERVAL_MS) || DAY_MS);
  const startDelayMs = Math.max(0, Number(env.OSV_MIRROR_START_DELAY_MS ?? 60_000));
  return { enabled, ecosystems, intervalMs, startDelayMs };
}

export async function runOsvMirrorSync({ db = pool, ecosystems = mirrorConfig().ecosystems, ...options } = {}) {
  if (busy) return { skipped: true };
  busy = true;
  const results = [];
  try {
    for (const ecosystem of ecosystems) {
      try {
        results.push(await syncEcosystem(db, ecosystem, options));
      } catch (err) {
        results.push({ ecosystem, error: err.message });
      }
    }
    lastResult = { at: new Date().toISOString(), results };
    return lastResult;
  } finally {
    busy = false;
  }
}

export function startOsvMirrorWorker(env = process.env) {
  const config = mirrorConfig(env);
  if (!config.enabled || timer) return false;
  log.info('OSV mirror worker enabled', { ecosystems: config.ecosystems, intervalMs: config.intervalMs });
  const tick = () => { runOsvMirrorSync({ ecosystems: config.ecosystems }).catch(() => {}); };
  timer = setTimeout(function loop() {
    tick();
    timer = setTimeout(loop, config.intervalMs);
    timer.unref?.();
  }, config.startDelayMs);
  timer.unref?.();
  return true;
}

export function stopOsvMirrorWorker() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function osvMirrorStatus() {
  return { running: Boolean(timer), busy, lastResult };
}
