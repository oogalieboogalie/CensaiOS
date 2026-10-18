/**
 * The last part of the app's log file (.homebase-state/logs, see
 * server/logRetention.js), as plain lines: for the error box's Details, the
 * GET /api/logs/recent route and the read_app_log agent tool. Only the end
 * of the newest files is read, so a big log never slows the board down.
 */
import fs from 'fs';
import path from 'path';
import { LOG_CONFIG } from '../logRetention.js';
import { scrubText } from '../selfFix/scrubText.js';

const RANK = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
const TAIL_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 500;

async function newestLogFiles(dir) {
  const names = await fs.promises.readdir(dir).catch(() => null);
  if (!names) return [];
  // homebase-YYYY-MM-DD.jsonl sorts by day; newest first.
  return names.filter((n) => /^homebase-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse().slice(0, 2)
    .map((n) => path.join(dir, n));
}

async function tailOf(file, bytes = TAIL_BYTES) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // the first line was cut in half
    return lines.filter(Boolean);
  } finally {
    await handle.close();
  }
}

function parse(line) {
  try {
    const record = JSON.parse(line);
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

/** Where a line came from: the board (browser), plain console output, or the server. */
export function sourceOf(record) {
  const ns = String(record?.namespace || '');
  if (ns.startsWith('browser')) return 'browser';
  if (ns === 'console') return 'console';
  return 'server';
}

export function formatRecord(record) {
  const meta = record.meta === undefined ? '' : ` ${typeof record.meta === 'string' ? record.meta : JSON.stringify(record.meta)}`;
  const time = String(record.time || '').replace('T', ' ').slice(0, 19);
  return scrubText(`${time} ${String(record.level || 'info').toUpperCase()} [${record.namespace || '?'}] ${record.message || ''}${meta}`, 1500);
}

/**
 * Recent log lines, oldest first.
 * @param {object} opts
 * @param {number} [opts.lines=100]  how many lines at most (500 max)
 * @param {string} [opts.level]      lowest level to keep: debug, info, warn, error
 * @param {number} [opts.minutes]    only lines from the last this-many minutes
 * @param {string} [opts.source]     server, browser or console (default all)
 * @param {string} [opts.search]     only lines containing these words
 */
export async function readRecentLog({ lines = 100, level, minutes, source, search, dir = LOG_CONFIG.dir, now = Date.now() } = {}) {
  const want = Math.max(1, Math.min(Number(lines) || 100, MAX_LINES));
  const floor = RANK[String(level || '').toLowerCase()] ?? 0;
  const since = Number(minutes) > 0 ? now - Number(minutes) * 60_000 : 0;
  const needle = String(search || '').trim().toLowerCase();
  const files = await newestLogFiles(dir);
  const picked = [];
  for (const file of files) {
    const raw = await tailOf(file).catch(() => []);
    const kept = [];
    for (const line of raw) {
      const record = parse(line);
      if (!record) continue;
      if ((RANK[String(record.level).toLowerCase()] ?? 2) < floor) continue;
      if (since && Date.parse(record.time) < since) continue;
      if (source && sourceOf(record) !== source) continue;
      const text = formatRecord(record);
      if (needle && !text.toLowerCase().includes(needle)) continue;
      kept.push(text);
    }
    picked.unshift(...kept);
    if (picked.length >= want) break;
  }
  return { file: files[0] ? path.basename(files[0]) : null, folder: dir, lines: picked.slice(-want) };
}
