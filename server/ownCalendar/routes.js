import express from 'express';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { addEvent, deleteEvent, listEvents, normalizeEventInput } from './store.js';

const log = createLogger('my-calendar');
const GONE = 'That event is not on your calendar any more.';

/**
 * Each person's own calendar, which the Calendar window shows with or
 * without Google (src/components/CalendarWindow.jsx).
 *
 * GET    /api/my-calendar/events?start=ISO&end=ISO   my events in that range
 * POST   /api/my-calendar/events                     { title, start, end, description }
 * DELETE /api/my-calendar/events/:id
 */
export function createMyCalendarRouter({ db = null, ready = dbReady } = {}) {
  const router = express.Router();
  const pool = async () => db || (await import('../db.js')).default;
  const id = (value) => (/^\d{1,9}$/.test(String(value)) ? Number(value) : null);

  router.use((req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in to keep your own calendar.' });
    if (!db && !ready()) {
      res.setHeader('Retry-After', '3');
      return res.status(503).json({ error: 'Your calendar needs the database, which is still starting. Try again in a moment.' });
    }
    return next();
  });

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res, await pool(), req.session.userId);
    } catch (err) {
      if (!err.statusCode) log.error('request failed', { path: req.path, code: safeErrorCode(err) });
      res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Your calendar hit a problem. It is in the app log.' });
    }
  };

  router.get('/events', handle(async (req, res, q, userId) => {
    res.json({ events: await listEvents(q, userId, { start: req.query.start, end: req.query.end }) });
  }));

  router.post('/events', handle(async (req, res, q, userId) => {
    const event = await addEvent(q, userId, normalizeEventInput(req.body));
    log.info('event added', { userId, eventId: event.id });
    res.status(201).json({ event });
  }));

  router.delete('/events/:id', handle(async (req, res, q, userId) => {
    const eventId = id(req.params.id);
    if (!eventId) return res.status(404).json({ error: GONE });
    await deleteEvent(q, userId, eventId);
    log.info('event deleted', { userId, eventId });
    return res.json({ ok: true });
  }));

  return router;
}

export const myCalendarRouter = createMyCalendarRouter();
