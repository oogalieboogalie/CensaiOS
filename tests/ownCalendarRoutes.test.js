// Each person's own calendar: signed in only, plain words for anything wrong,
// and nobody reads or deletes someone else's events.
import express from 'express';
import request from 'supertest';
import { createMyCalendarRouter } from '../server/ownCalendar/routes.js';
import { listRange, MAX_EVENTS, normalizeEventInput } from '../server/ownCalendar/store.js';

/** An in-memory stand-in for the own_calendar_events table. */
function fakeDb(rows = []) {
  let next = rows.length + 1;
  const calls = [];
  return {
    rows,
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT COUNT(*)')) return { rows: [{ n: rows.filter((r) => r.user_id === params[0]).length }] };
      if (sql.startsWith('INSERT')) {
        const [user_id, title, notes, starts_at, ends_at] = params;
        const row = { id: next++, user_id, title, notes, starts_at, ends_at };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('DELETE')) {
        const at = rows.findIndex((r) => r.user_id === params[0] && r.id === params[1]);
        if (at >= 0) rows.splice(at, 1);
        return { rowCount: at >= 0 ? 1 : 0 };
      }
      const [userId, from, to] = params;
      return { rows: rows.filter((r) => r.user_id === userId && r.starts_at < to && r.ends_at > from) };
    },
  };
}

function app({ session = { userId: 7 }, db = fakeDb(), ready } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = session; next(); });
  instance.use('/api/my-calendar', createMyCalendarRouter(ready ? { ready } : { db }));
  return { instance, db };
}

const row = (over = {}) => ({
  id: 1, user_id: 7, title: 'Made-up dentist', notes: '', starts_at: '2026-10-20T19:00:00.000Z', ends_at: '2026-10-20T20:00:00.000Z', ...over,
});
const OCTOBER = '?start=2026-09-27T05:00:00.000Z&end=2026-11-01T04:59:59.999Z';

test('signed out gets a 401 in plain words', async () => {
  const res = await request(app({ session: {} }).instance).get(`/api/my-calendar/events${OCTOBER}`);
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Sign in to keep your own calendar.');
});

test('while the database is still starting it says so', async () => {
  const res = await request(app({ ready: () => false }).instance).get(`/api/my-calendar/events${OCTOBER}`);
  expect(res.status).toBe(503);
  expect(res.body.error).toMatch(/still starting/);
});

test("lists only my events in the month asked for, never someone else's", async () => {
  const db = fakeDb([row(), row({ id: 2, user_id: 8, title: 'Made-up other person' }), row({ id: 3, starts_at: '2026-12-01T15:00:00.000Z', ends_at: '2026-12-01T16:00:00.000Z' })]);
  const res = await request(app({ db }).instance).get(`/api/my-calendar/events${OCTOBER}`);
  expect(res.status).toBe(200);
  expect(res.body.events).toEqual([{
    id: 1, title: 'Made-up dentist', description: '', start: '2026-10-20T19:00:00.000Z', end: '2026-10-20T20:00:00.000Z', source: 'own',
  }]);
  expect(db.calls[0].params[0]).toBe(7);
});

test('adding an event saves it to my calendar and gives it back', async () => {
  const { instance, db } = app();
  const res = await request(instance).post('/api/my-calendar/events')
    .send({ title: '  Made-up   dentist ', start: '2026-10-20T19:00:00.000Z', end: '2026-10-20T20:00:00.000Z', description: 'Bring the made-up card' });
  expect(res.status).toBe(201);
  expect(res.body.event).toMatchObject({ title: 'Made-up dentist', description: 'Bring the made-up card', source: 'own' });
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].user_id).toBe(7);
});

test('hidden characters are dropped instead of failing the save', async () => {
  const { instance, db } = app();
  const res = await request(instance).post('/api/my-calendar/events')
    .send({ title: 'Made-up\u0000 recital', description: 'Bring\u0000 music\n\tand a stand', start: '2026-10-20T19:00:00Z', end: '2026-10-20T20:00:00Z' });
  expect(res.status).toBe(201);
  expect(res.body.event).toMatchObject({ title: 'Made-up recital', description: 'Bring music\n\tand a stand' });
  expect(db.rows[0].title).toBe('Made-up recital');
});

test.each([
  [{ start: '2026-10-20T19:00:00Z', end: '2026-10-20T20:00:00Z' }, 'Give the event a name.'],
  [{ title: 'Made-up', end: '2026-10-20T20:00:00Z' }, 'Pick when the event starts.'],
  [{ title: 'Made-up', start: '2026-10-20T19:00:00Z', end: 'soon' }, 'Pick when the event ends.'],
  [{ title: 'Made-up', start: '2026-10-20T19:00:00Z', end: '2026-10-20T18:00:00Z' }, 'The event has to end after it starts.'],
  [{ title: 'Made-up', start: '2026-10-20T19:00:00Z', end: '2028-10-20T19:00:00Z' }, 'An event can last up to 400 days.'],
  [{ title: 'Made-up', start: '+275760-09-13T00:00:00Z', end: '2026-10-20T19:00:00Z' }, 'Pick when the event starts.'],
  [{ title: '\u0000\u0007', start: '2026-10-20T19:00:00Z', end: '2026-10-20T20:00:00Z' }, 'Give the event a name.'],
])('an event that cannot be saved says why in plain words (%#)', async (body, words) => {
  const { instance, db } = app();
  const res = await request(instance).post('/api/my-calendar/events').send(body);
  expect(res.status).toBe(400);
  expect(res.body.error).toBe(words);
  expect(db.rows).toHaveLength(0);
});

test('a full calendar says so instead of growing forever', async () => {
  const db = fakeDb();
  db.query = (original => async (sql, params) => (sql.startsWith('SELECT COUNT(*)') ? { rows: [{ n: MAX_EVENTS }] } : original(sql, params)))(db.query);
  const res = await request(app({ db }).instance).post('/api/my-calendar/events')
    .send({ title: 'Made-up', start: '2026-10-20T19:00:00Z', end: '2026-10-20T20:00:00Z' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/holds 5000 events/);
});

test("deleting someone else's event, or one already gone, is a 404 and changes nothing", async () => {
  const db = fakeDb([row({ id: 2, user_id: 8 })]);
  const { instance } = app({ db });
  for (const path of ['/api/my-calendar/events/2', '/api/my-calendar/events/99', '/api/my-calendar/events/not-a-number']) {
    const res = await request(instance).delete(path);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('That event is not on your calendar any more.');
  }
  expect(db.rows).toHaveLength(1);
});

test('deleting my own event removes it', async () => {
  const db = fakeDb([row()]);
  const res = await request(app({ db }).instance).delete('/api/my-calendar/events/1');
  expect(res.status).toBe(200);
  expect(db.rows).toHaveLength(0);
});

test('a database problem stays in the app log and the window gets plain words', async () => {
  const db = { query: async () => { throw Object.assign(new Error('relation "own_calendar_events" does not exist'), { code: '42P01' }); } };
  const res = await request(app({ db }).instance).get(`/api/my-calendar/events${OCTOBER}`);
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Your calendar hit a problem. It is in the app log.');
});

describe('what an event and a range may be', () => {
  test('a name is trimmed and cut to 200 letters, notes to 2000', () => {
    const input = normalizeEventInput({ title: `  ${'a'.repeat(250)}  `, description: 'b'.repeat(2500), start: '2026-10-20T19:00:00Z', end: '2026-10-20T20:00:00Z' });
    expect(input.title).toHaveLength(200);
    expect(input.notes).toHaveLength(2000);
  });

  test('no range means the next 7 days, and a long one is cut to 400 days', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    const week = listRange({}, now);
    expect(week.to - week.from).toBe(7 * 24 * 60 * 60 * 1000);
    const long = listRange({ start: '2026-01-01T00:00:00Z', end: '2030-01-01T00:00:00Z' }, now);
    expect((long.to - long.from) / (24 * 60 * 60 * 1000)).toBe(400);
    expect(() => listRange({ start: '2026-10-02T00:00:00Z', end: '2026-10-01T00:00:00Z' }, now)).toThrow('The range has to end after it starts.');
  });
});
