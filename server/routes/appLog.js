/**
 * The app's log (server/appLog/).
 *
 * POST /api/logs/browser   { entries: [{ level, message, detail, where, time }] }
 *                          the board's own errors and warnings, from any
 *                          signed-in member, into the same file as the server's
 * GET  /api/logs/recent    ?lines=&level=&minutes=&source=&search=
 *                          the last lines, scrubbed (see appLog/access.js for who)
 */
import express from 'express';
import { writeLogRecord } from '../logger.js';
import { readRecentLog } from '../appLog/readLog.js';
import { canReadAppLog } from '../appLog/access.js';
import { OWNER_ONLY_MESSAGE } from '../security/systemAdmin.js';

export const appLogRouter = express.Router();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const LEVELS = new Set(['error', 'warn', 'info']);
const recent = new Map(); // user → { start, count }

function take(req, n) {
  const key = String(req.session?.userId ?? req.ip);
  const now = Date.now();
  let slot = recent.get(key);
  if (!slot || now - slot.start > WINDOW_MS) slot = { start: now, count: 0 };
  const room = Math.max(0, MAX_PER_WINDOW - slot.count);
  slot.count += Math.min(n, room);
  recent.set(key, slot);
  if (recent.size > 500) recent.delete(recent.keys().next().value);
  return Math.min(n, room);
}

const clip = (value, max) => String(value ?? '').slice(0, max);

appLogRouter.post('/browser', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
  const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 50) : [];
  const allowed = take(req, entries.length);
  for (const entry of entries.slice(0, allowed)) {
    const level = LEVELS.has(entry?.level) ? entry.level : 'info';
    const where = clip(entry?.where, 60).replace(/[^\w.-]/g, '');
    const time = Number.isNaN(Date.parse(entry?.time)) ? undefined : new Date(entry.time).toISOString();
    writeLogRecord({
      level,
      namespace: where ? `browser:${where}` : 'browser',
      message: clip(entry?.message, 2000),
      meta: { user: Number(req.session.userId), ...(entry?.detail ? { detail: clip(entry.detail, 4000) } : {}) },
      time,
    });
  }
  res.status(202).json({ ok: true, kept: allowed });
});

appLogRouter.get('/recent', async (req, res) => {
  try {
    if (!(await canReadAppLog(req.session?.userId))) {
      return res.status(403).json({ error: OWNER_ONLY_MESSAGE, reason: 'owner-only', code: 'computer_owner_only' });
    }
    const { lines, level, minutes, source, search } = req.query;
    res.json(await readRecentLog({ lines, level, minutes, source, search }));
  } catch {
    res.status(500).json({ error: 'The log could not be read.' });
  }
});
