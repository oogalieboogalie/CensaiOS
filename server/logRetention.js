import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(path.join(__dirname, '..'));

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bytesEnv(name, fallback) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  const match = raw.match(/^(\d+)(b|kb|mb|gb)?$/);
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2] || 'b';
  const scale = unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1;
  return value * scale;
}

export const LOG_CONFIG = Object.freeze({
  fileEnabled: boolEnv('LOG_FILE_ENABLED', true),
  dir: path.resolve(REPO_ROOT, process.env.LOG_DIR || '.homebase-state/logs'),
  retentionDays: intEnv('LOG_RETENTION_DAYS', 14),
  maxBytes: bytesEnv('LOG_MAX_BYTES', 100 * 1024 * 1024),
  cleanupIntervalMs: intEnv('LOG_CLEANUP_INTERVAL_HOURS', 24) * 60 * 60 * 1000,
});

export function getLogFilePath(date = new Date()) {
  const yyyyMmDd = date.toISOString().slice(0, 10);
  return path.join(LOG_CONFIG.dir, `homebase-${yyyyMmDd}.jsonl`);
}

async function listLogFiles(dir = LOG_CONFIG.dir) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.promises.stat(filePath);
    files.push({ path: filePath, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return files.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export async function cleanupLogs(config = LOG_CONFIG) {
  if (!config.fileEnabled) return { deleted: 0, bytesDeleted: 0, remainingBytes: 0 };
  await fs.promises.mkdir(config.dir, { recursive: true });

  const now = Date.now();
  const maxAgeMs = config.retentionDays * 24 * 60 * 60 * 1000;
  let files = await listLogFiles(config.dir);
  let deleted = 0;
  let bytesDeleted = 0;

  for (const file of files) {
    if (config.retentionDays > 0 && now - file.mtimeMs > maxAgeMs) {
      await fs.promises.rm(file.path, { force: true });
      deleted++;
      bytesDeleted += file.size;
    }
  }

  files = await listLogFiles(config.dir);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (config.maxBytes > 0) {
    for (const file of files) {
      if (total <= config.maxBytes) break;
      await fs.promises.rm(file.path, { force: true });
      deleted++;
      bytesDeleted += file.size;
      total -= file.size;
    }
  }

  return { deleted, bytesDeleted, remainingBytes: total };
}

export function startLogCleanup({ logger } = {}) {
  if (!LOG_CONFIG.fileEnabled) return null;

  const run = async () => {
    try {
      const result = await cleanupLogs();
      logger?.info?.('log cleanup complete', result);
    } catch (err) {
      logger?.warn?.('log cleanup failed', { error: err.message });
    }
  };

  run();
  const interval = setInterval(run, Math.max(LOG_CONFIG.cleanupIntervalMs, 60 * 60 * 1000));
  interval.unref?.();
  return interval;
}
