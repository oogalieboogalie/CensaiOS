// Each person's own calendar (docker/092-own-calendar.sql): the events the
// Calendar window shows with or without Google, and that agents read and add
// when Google is not connected. Every read and write is scoped to one
// person's user id.

export const MAX_EVENTS = 5000;
const MAX_TITLE = 200;
const MAX_NOTES = 2000;
const LIST_LIMIT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPAN_DAYS = 400;
const MAX_SPAN = MAX_SPAN_DAYS * DAY_MS;

const plain = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
// Hidden control characters (Postgres refuses NUL in text) are dropped;
// notes keep their tabs and line breaks.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A Date from an ISO string, a number or a Date; null for anything else. */
function when(value) {
  const ok = typeof value === 'string' || typeof value === 'number' || value instanceof Date;
  const time = ok && value !== '' ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(time)) return null;
  const year = new Date(time).getUTCFullYear();
  return year >= 1000 && year <= 9999 ? new Date(time) : null;
}

/** One event as the window and agents see it, shaped like a Google one. */
export function eventView(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.notes || '',
    start: new Date(row.starts_at).toISOString(),
    end: new Date(row.ends_at).toISOString(),
    source: 'own',
  };
}

/** Cleans what the window or an agent sent; throws a plain-words 400. */
export function normalizeEventInput(sent) {
  const body = sent && typeof sent === 'object' ? sent : {};
  const title = String(body.title ?? '').replace(HIDDEN, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  if (!title) throw plain('Give the event a name.');
  const start = when(body.start);
  const end = when(body.end);
  if (!start) throw plain('Pick when the event starts.');
  if (!end) throw plain('Pick when the event ends.');
  if (end <= start) throw plain('The event has to end after it starts.');
  if (end - start > MAX_SPAN) throw plain(`An event can last up to ${MAX_SPAN_DAYS} days.`);
  const notes = String(body.description ?? body.notes ?? '').replace(HIDDEN, '').slice(0, MAX_NOTES);
  return { title, notes, start, end };
}

/** The range asked for; with none, the next 7 days (as for Google). */
export function listRange({ start, end } = {}, now = Date.now()) {
  const from = when(start) || new Date(now);
  const to = when(end) || new Date(from.getTime() + 7 * DAY_MS);
  if (to <= from) throw plain('The range has to end after it starts.');
  return { from, to: to - from > MAX_SPAN ? new Date(from.getTime() + MAX_SPAN) : to };
}

/** My events that overlap the range, earliest first. */
export async function listEvents(db, userId, range) {
  const { from, to } = listRange(range);
  const { rows } = await db.query(
    `SELECT id, title, notes, starts_at, ends_at FROM own_calendar_events
      WHERE user_id = $1 AND starts_at < $3 AND ends_at > $2
      ORDER BY starts_at, id LIMIT ${LIST_LIMIT}`,
    [userId, from.toISOString(), to.toISOString()],
  );
  return rows.map(eventView);
}

export async function addEvent(db, userId, input) {
  const { rows: [count] } = await db.query('SELECT COUNT(*)::int AS n FROM own_calendar_events WHERE user_id = $1', [userId]);
  if ((count?.n || 0) >= MAX_EVENTS) {
    throw plain(`Your calendar holds ${MAX_EVENTS} events, the most it keeps. Delete some old ones first.`);
  }
  const { rows } = await db.query(
    `INSERT INTO own_calendar_events (user_id, title, notes, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, title, notes, starts_at, ends_at`,
    [userId, input.title, input.notes, input.start.toISOString(), input.end.toISOString()],
  );
  return eventView(rows[0]);
}

export async function deleteEvent(db, userId, eventId) {
  const res = await db.query('DELETE FROM own_calendar_events WHERE user_id = $1 AND id = $2', [userId, eventId]);
  if (!res.rowCount) throw plain('That event is not on your calendar any more.', 404);
}
