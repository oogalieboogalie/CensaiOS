import { runDevHash } from '../../shared/logs/addressNames.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { listDevServers, stopDevServer } from './manager.js';

// Run dev containers live only while a Run dev window is open. Each open
// window pings every 20 seconds; a container nobody has pinged for two
// minutes (window closed, app closed) is removed. Containers left over from
// before a restart get the same two minutes to be claimed again. A container's
// name carries its project's folder, so the log names its folder's hash.

const log = createLogger('dev-servers');
export const IDLE_MS = 2 * 60_000;
const lastSeen = new Map();
let bootedAt = Date.now();
let timer = null;

export function heartbeat(names = []) {
  const now = Date.now();
  for (const n of names) if (typeof n === 'string' && n.startsWith('censai-dev-')) lastSeen.set(n, now);
}

export function markStopped(name) { lastSeen.delete(name); }

export async function reapIdle(now = Date.now()) {
  let servers;
  try { servers = await listDevServers(); } catch { return []; }
  const removed = [];
  for (const s of servers) {
    const seen = lastSeen.get(s.name) ?? bootedAt;
    if (now - seen < IDLE_MS) continue;
    try {
      await stopDevServer(s.name);
      lastSeen.delete(s.name);
      removed.push(s.name);
    } catch (err) {
      log.warn('Could not remove idle dev server', { folderHash: runDevHash(s.name), code: safeErrorCode(err) });
    }
  }
  if (removed.length) log.info('Removed dev servers no window is using', { count: removed.length, folderHashes: removed.map(runDevHash) });
  return removed;
}

export function startDevServerReaper() {
  bootedAt = Date.now();
  if (timer) return;
  timer = setInterval(() => { reapIdle(); }, 30_000);
  timer.unref?.();
}

/** On shutdown: remove every Run dev container, but never hold exit long. */
export async function stopAllDevServers(limitMs = 4_000) {
  const work = (async () => {
    const servers = await listDevServers().catch(() => []);
    await Promise.all(servers.map((s) => stopDevServer(s.name).catch(() => {})));
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, limitMs))]);
}

export function resetReaperForTests() { lastSeen.clear(); bootedAt = Date.now(); }
