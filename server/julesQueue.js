import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverHandoffTasks, reconcileDiscoveredTasks } from './julesQueueDiscovery.js';

export const DEFAULT_JULES_QUEUE_PATH = path.resolve('.team', 'handoffs', 'queue.json');

function entries(value) {
  return Array.isArray(value) ? value : [];
}

function present(entry, status) {
  const item = typeof entry === 'string' ? { brief: entry } : { ...(entry || {}) };
  return {
    ...item,
    status: item.status || status,
    brief: item.brief || null,
    title: item.title || item.note || path.basename(item.brief || 'Untitled task', '.md'),
  };
}

export async function readJulesQueue(queuePath = DEFAULT_JULES_QUEUE_PATH, options = {}) {
  const resolvedPath = path.resolve(queuePath);
  const [raw, stat] = await Promise.all([
    fs.readFile(resolvedPath, 'utf8'),
    fs.stat(resolvedPath),
  ]);
  const queue = JSON.parse(raw);
  const repoRoot = options.repoRoot || path.resolve(path.dirname(resolvedPath), '..', '..');
  const discovered = await discoverHandoffTasks({
    repoRoot,
    handoffDir: options.handoffDir || path.dirname(resolvedPath),
  });
  const pendingState = reconcileDiscoveredTasks(queue, discovered);
  const pending = pendingState.map(entry => present(entry, 'pending'));
  const inflight = entries(queue.inflight).map(entry => present(entry, 'inflight'));
  const blocked = entries(queue.blocked).map(entry => present(entry, 'blocked'));
  const dispatched = entries(queue.dispatched).map(entry => present(entry, entry?.status || 'dispatched'));
  return {
    path: resolvedPath,
    updatedAt: stat.mtime.toISOString(),
    repo: queue.repo || process.env.JULES_QUEUE_REPO || null,
    branch: queue.branch || process.env.JULES_QUEUE_BRANCH || 'master',
    autoMerge: queue.autoMerge !== false,
    discovery: {
      directory: path.dirname(resolvedPath),
      actionable: discovered.length,
    },
    pending,
    inflight,
    blocked,
    dispatched,
    counts: {
      pending: pending.length,
      inflight: inflight.length,
      blocked: blocked.length,
      dispatched: dispatched.length,
    },
  };
}
