// Schedule clocks were read in the server process zone. Docker leaves TZ unset,
// so Node is UTC and a 9:00 AM Chicago schedule was stored as 09:00Z (3:00 AM
// local). "09:00" and "9:00AM" missed the "H:MM AM/PM" pattern and became noon.
// A missing time threw a TypeError, and "next tuesday" became an Invalid Date.
import { jest } from '@jest/globals';
import { parseScheduledTime } from '../server/memory/schedules_utils.js';
import { createSchedule as createScheduleRow } from '../server/scheduler/store.js';
import { createSchedule as postSchedule } from '../src/lib/api/schedules.js';

const CHICAGO_NINE = '2026-11-10T15:00:00.000Z';

describe('parseScheduledTime', () => {
  test('9:00 AM is the person\'s zone, not the server process zone', () => {
    const chicago = parseScheduledTime('2026-11-10', '9:00 AM', 'America/Chicago');
    const london = parseScheduledTime('2026-11-10', '9:00 AM', 'Europe/London');
    // 10 Nov 2026 is CST (UTC-6) and GMT (UTC+0).
    expect(chicago.toISOString()).toBe(CHICAGO_NINE);
    expect(london.toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(chicago.getTime()).not.toBe(london.getTime());
  });

  test('summer and winter offsets both stay on the named clock', () => {
    // 20 Jul 2026 is CDT (UTC-5) and EDT (UTC-4).
    expect(parseScheduledTime('2026-07-20', '9:00 AM', 'America/Chicago').toISOString())
      .toBe('2026-07-20T14:00:00.000Z');
    expect(parseScheduledTime('2026-07-20', '9:00 AM', 'America/New_York').toISOString())
      .toBe('2026-07-20T13:00:00.000Z');
  });

  test('with no zone, the clock is America/Chicago even when the process zone is UTC', () => {
    const prevTz = process.env.TZ;
    const prevLocal = process.env.LOCAL_DEV_TIME_ZONE;
    process.env.TZ = 'UTC';
    delete process.env.LOCAL_DEV_TIME_ZONE;
    try {
      expect(parseScheduledTime('2026-11-10', '9:00 AM').toISOString()).toBe(CHICAGO_NINE);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
      if (prevLocal === undefined) delete process.env.LOCAL_DEV_TIME_ZONE;
      else process.env.LOCAL_DEV_TIME_ZONE = prevLocal;
    }
  });

  test('LOCAL_DEV_TIME_ZONE is the configured clock when the request names none', () => {
    const prev = process.env.LOCAL_DEV_TIME_ZONE;
    process.env.LOCAL_DEV_TIME_ZONE = 'America/New_York';
    try {
      expect(parseScheduledTime('2026-11-10', '9:00 AM').toISOString()).toBe('2026-11-10T14:00:00.000Z');
      expect(parseScheduledTime('2026-11-10', '9:00 AM', 'America/Chicago').toISOString()).toBe(CHICAGO_NINE);
    } finally {
      if (prev === undefined) delete process.env.LOCAL_DEV_TIME_ZONE;
      else process.env.LOCAL_DEV_TIME_ZONE = prev;
    }
  });

  test('09:00 and 9:00AM are 9:00, not noon', () => {
    expect(parseScheduledTime('2026-11-10', '09:00', 'America/Chicago').toISOString()).toBe(CHICAGO_NINE);
    expect(parseScheduledTime('2026-11-10', '9:00AM', 'America/Chicago').toISOString()).toBe(CHICAGO_NINE);
    expect(parseScheduledTime('2026-11-10', '09:00 AM', 'America/Chicago').toISOString()).toBe(CHICAGO_NINE);
  });

  test('noon, midnight, and an evening time keep their clock', () => {
    expect(parseScheduledTime('2026-11-10', '12:45 PM', 'America/Chicago').toISOString())
      .toBe('2026-11-10T18:45:00.000Z');
    expect(parseScheduledTime('2026-11-10', '12:00 AM', 'America/Chicago').toISOString())
      .toBe('2026-11-10T06:00:00.000Z');
    expect(parseScheduledTime('2026-11-10', '21:00', 'America/Chicago').toISOString())
      .toBe('2026-11-11T03:00:00.000Z');
  });

  test('a missing time is a clear refusal, not a crash', () => {
    expect(() => parseScheduledTime('2026-11-10', undefined)).toThrow('A schedule needs a time, like 9:00 AM.');
    expect(() => parseScheduledTime('2026-11-10', '   ')).toThrow('A schedule needs a time, like 9:00 AM.');
    try {
      parseScheduledTime('2026-11-10');
    } catch (error) {
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error.statusCode).toBe(400);
    }
  });

  test('a bad date or a bad clock is a clear refusal, not noon or an invalid date', () => {
    expect(() => parseScheduledTime('next tuesday', '9:00 AM')).toThrow(
      'Could not read "next tuesday" as a date. Use a date like 2026-11-10.',
    );
    expect(() => parseScheduledTime('2026-02-31', '9:00 AM')).toThrow(/date/i);
    expect(() => parseScheduledTime('2026-11-10', '9:00PMX')).toThrow(
      'Could not read "9:00PMX" as a time. Use 9:00 AM or 09:00.',
    );
    expect(() => parseScheduledTime('2026-11-10', 'Not/AZone')).toThrow(/time/i);
    let thrown = false;
    try {
      const parsed = parseScheduledTime('next tuesday', '9:00 AM');
      expect(String(parsed)).not.toBe('Invalid Date');
    } catch (error) {
      thrown = true;
      expect(error.statusCode).toBe(400);
    }
    expect(thrown).toBe(true);
  });

  test('a clock skipped by daylight saving is a clear refusal, not a shifted hour', () => {
    // 8 Mar 2026, the US spring-forward: 2:30 AM Chicago never happens.
    expect(() => parseScheduledTime('2026-03-08', '2:30 AM', 'America/Chicago')).toThrow(
      'That time does not exist on that date in this time zone.',
    );
    expect(parseScheduledTime('2026-03-08', '3:00 AM', 'America/Chicago').toISOString())
      .toBe('2026-03-08T08:00:00.000Z');
  });

  test('a zone the runtime does not know is refused', () => {
    expect(() => parseScheduledTime('2026-11-10', '9:00 AM', 'Not/AZone')).toThrow(
      'That time zone is not recognized. Use one like America/Chicago.',
    );
  });

  test('a new schedule stores the instant the browser clock named', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'schedule-1' }] }) };
    await createScheduleRow({
      agent_id: 'censai',
      task_text: 'Morning check',
      scheduled_date: '2026-11-10',
      scheduled_time: '9:00 AM',
      timeZone: 'America/Chicago',
    }, { db, userId: 7, workspaceId: 'workspace-1' });
    const nextRunAt = db.query.mock.calls[0][1][13];
    expect(nextRunAt.toISOString()).toBe(CHICAGO_NINE);
  });

  test('the browser client sends its own time zone with a new schedule', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
    });
    try {
      await postSchedule({
        agent_id: 'censai',
        task_text: 'Morning check',
        scheduled_date: '2026-11-10',
        scheduled_time: '9:00 AM',
      }, 'workspace-1');
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(body.workspaceId).toBe('workspace-1');
    } finally {
      delete global.fetch;
    }
  });
});
