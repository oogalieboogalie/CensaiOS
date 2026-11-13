// Repeats used the server clock. With that clock on UTC, a 9:00 PM Chicago
// time is already the next day, so Monday/Wednesday became Tue, Sun, Tue, Sun,
// and a Monday-only 9 PM moved to Sundays. A 9:00 AM set before daylight
// saving also slid to 10:00 AM after the spring-forward, and to 8:00 AM after
// the fall-back. The fall-back hour happens twice; the earlier one is the one
// we keep, including zones east of UTC.
import { rowFieldsFromSpec } from '../src/lib/schedule/fromScheduler.js';
import { upcomingRuns } from '../src/lib/schedule/plainWords.js';
import { calculateNextRun, nextRunAfter, parseScheduledTime } from '../server/memory/schedules_utils.js';

const CHICAGO = 'America/Chicago';
const MON_WED = { m: true, w: true };
const MONDAY = { m: true };
const WEEKDAYS = { m: true, t: true, w: true, th: true, f: true };
const EVERY_DAY = { s: true, m: true, t: true, w: true, th: true, f: true, sat: true };

function withUtcProcess(run) {
  const prevTz = process.env.TZ;
  const prevLocal = process.env.LOCAL_DEV_TIME_ZONE;
  process.env.TZ = 'UTC';
  delete process.env.LOCAL_DEV_TIME_ZONE;
  try {
    return run();
  } finally {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
    if (prevLocal === undefined) delete process.env.LOCAL_DEV_TIME_ZONE;
    else process.env.LOCAL_DEV_TIME_ZONE = prevLocal;
  }
}

function chicagoStamp(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`;
}

function chicagoWall(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.weekday} ${value.hour}:${value.minute}`;
}

test('weekly Monday and Wednesday at 9 PM Chicago stays on those days when the process clock is UTC', () => {
  withUtcProcess(() => {
    let cursor = parseScheduledTime('2026-11-09', '9:00 PM', CHICAGO);
    const runs = [];
    for (let i = 0; i < 6; i += 1) {
      cursor = calculateNextRun(cursor, 'weekly', MON_WED, CHICAGO);
      runs.push(cursor.toISOString());
    }
    expect(runs).toEqual([
      '2026-11-12T03:00:00.000Z',
      '2026-11-17T03:00:00.000Z',
      '2026-11-19T03:00:00.000Z',
      '2026-11-24T03:00:00.000Z',
      '2026-11-26T03:00:00.000Z',
      '2026-12-01T03:00:00.000Z',
    ]);
    expect(runs.map((iso) => chicagoWall(new Date(iso)))).toEqual([
      'Wed 21:00', 'Mon 21:00', 'Wed 21:00', 'Mon 21:00', 'Wed 21:00', 'Mon 21:00',
    ]);
  });
});

test('Monday-only 9 PM Chicago stays on Monday, not Sunday, when the process clock is UTC', () => {
  withUtcProcess(() => {
    let cursor = parseScheduledTime('2026-11-09', '9:00 PM', CHICAGO);
    const runs = [];
    for (let i = 0; i < 4; i += 1) {
      cursor = calculateNextRun(cursor, 'weekly', MONDAY, CHICAGO);
      runs.push(chicagoWall(cursor));
    }
    expect(runs).toEqual(['Mon 21:00', 'Mon 21:00', 'Mon 21:00', 'Mon 21:00']);
  });
});

test('a weekly 9 AM keeps 9 AM across the spring-forward and the fall-back', () => {
  withUtcProcess(() => {
    const beforeSpring = parseScheduledTime('2026-03-02', '9:00 AM', CHICAGO);
    const afterSpring = calculateNextRun(beforeSpring, 'weekly', MONDAY, CHICAGO);
    expect(beforeSpring.toISOString()).toBe('2026-03-02T15:00:00.000Z');
    expect(afterSpring.toISOString()).toBe('2026-03-09T14:00:00.000Z');
    expect(chicagoWall(afterSpring)).toBe('Mon 09:00');

    const beforeFall = parseScheduledTime('2026-10-26', '9:00 AM', CHICAGO);
    const afterFall = calculateNextRun(beforeFall, 'weekly', MONDAY, CHICAGO);
    expect(beforeFall.toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(afterFall.toISOString()).toBe('2026-11-02T15:00:00.000Z');
    expect(chicagoWall(afterFall)).toBe('Mon 09:00');
  });
});

test('daily and weekday repeats keep the Chicago clock across daylight saving', () => {
  withUtcProcess(() => {
    const saturday = parseScheduledTime('2026-03-07', '9:00 AM', CHICAGO);
    const sunday = calculateNextRun(saturday, 'weekly', EVERY_DAY, CHICAGO);
    expect(sunday.toISOString()).toBe('2026-03-08T14:00:00.000Z');
    expect(chicagoWall(sunday)).toBe('Sun 09:00');

    const friday = parseScheduledTime('2026-03-06', '9:00 PM', CHICAGO);
    const monday = calculateNextRun(friday, 'weekly', WEEKDAYS, CHICAGO);
    expect(monday.toISOString()).toBe('2026-03-10T02:00:00.000Z');
    expect(chicagoWall(monday)).toBe('Mon 21:00');
  });
});

test('the fall-back hour that happens twice keeps the earlier one, east of UTC too', () => {
  // Chicago, 1 Nov 2026: 1:30 AM CDT, then again 1:30 AM CST.
  expect(parseScheduledTime('2026-11-01', '1:30 AM', CHICAGO).toISOString())
    .toBe('2026-11-01T06:30:00.000Z');
  // London, 25 Oct 2026: 1:30 AM BST, then again 1:30 AM GMT.
  expect(parseScheduledTime('2026-10-25', '1:30 AM', 'Europe/London').toISOString())
    .toBe('2026-10-25T00:30:00.000Z');
  // Sydney, 5 Apr 2026: 2:30 AM AEDT, then again 2:30 AM AEST.
  expect(parseScheduledTime('2026-04-05', '2:30 AM', 'Australia/Sydney').toISOString())
    .toBe('2026-04-04T15:30:00.000Z');
});

test('a monthly 31st clamps to the short month and comes back, still at 9:30 AM Chicago', () => {
  withUtcProcess(() => {
    let cursor = parseScheduledTime('2026-01-31', '9:30 AM', CHICAGO);
    const landed = [];
    for (let i = 0; i < 5; i += 1) {
      cursor = calculateNextRun(cursor, 'monthly', 31, CHICAGO);
      landed.push(`${cursor.toISOString()} ${chicagoWall(cursor)}`);
    }
    expect(landed).toEqual([
      '2026-02-28T15:30:00.000Z Sat 09:30',
      '2026-03-31T14:30:00.000Z Tue 09:30',
      '2026-04-30T14:30:00.000Z Thu 09:30',
      '2026-05-31T14:30:00.000Z Sun 09:30',
      '2026-06-30T14:30:00.000Z Tue 09:30',
    ]);
    const caughtUp = nextRunAfter(
      parseScheduledTime('2026-01-31', '9:30 AM', CHICAGO),
      'monthly',
      31,
      new Date('2026-04-15T12:00:00Z'),
      CHICAGO,
    );
    expect(caughtUp.toISOString()).toBe('2026-04-30T14:30:00.000Z');
    expect(chicagoWall(caughtUp)).toBe('Thu 09:30');
  });
});

test('a monthly 31st at 8 PM Chicago stays on that evening when the process clock is UTC', () => {
  // Counting the month on the UTC instant skips ahead: Jan 31 at 8 PM is
  // already Feb 1 there, so the next runs would be Mar 30, Apr 29, May 30.
  withUtcProcess(() => {
    let cursor = parseScheduledTime('2026-01-31', '8:00 PM');
    const landed = [chicagoStamp(cursor)];
    for (let i = 0; i < 3; i += 1) {
      cursor = calculateNextRun(cursor, 'monthly', 31);
      landed.push(chicagoStamp(cursor));
    }
    expect(landed).toEqual([
      '2026-01-31 20:00',
      '2026-02-28 20:00',
      '2026-03-31 20:00',
      '2026-04-30 20:00',
    ]);
    expect(parseScheduledTime('2026-01-31', '8:00 PM').toISOString()).toBe('2026-02-01T02:00:00.000Z');
    expect(calculateNextRun(parseScheduledTime('2026-01-31', '8:00 PM'), 'monthly', 31).toISOString())
      .toBe('2026-03-01T02:00:00.000Z');
  });
});

test('an 11:30 PM monthly 31st keeps November, and a leap-year February keeps the 29th', () => {
  withUtcProcess(() => {
    const october = parseScheduledTime('2026-10-31', '11:30 PM');
    const november = calculateNextRun(october, 'monthly', 31);
    expect(chicagoStamp(october)).toBe('2026-10-31 23:30');
    expect(chicagoStamp(november)).toBe('2026-11-30 23:30');

    const january = parseScheduledTime('2024-01-31', '8:00 PM');
    expect(chicagoStamp(calculateNextRun(january, 'monthly', 31))).toBe('2024-02-29 20:00');
    const april = parseScheduledTime('2026-04-30', '8:00 PM');
    expect(chicagoStamp(calculateNextRun(april, 'monthly', 31))).toBe('2026-05-31 20:00');
    expect(chicagoStamp(calculateNextRun(parseScheduledTime('2026-01-30', '8:00 PM'), 'monthly', 30))).toBe('2026-02-28 20:00');
    expect(chicagoStamp(calculateNextRun(parseScheduledTime('2026-01-29', '8:00 PM'), 'monthly', 29))).toBe('2026-02-28 20:00');
    expect(chicagoStamp(calculateNextRun(parseScheduledTime('2026-12-31', '8:00 PM'), 'monthly', 31))).toBe('2027-01-31 20:00');
  });
});

test('the upcoming-dates preview steps that same Chicago month', () => {
  withUtcProcess(() => {
    const runs = upcomingRuns(
      { time: '20:00', date: '2026-01-31', repeat: 'monthly' },
      new Date('2026-01-01T00:00:00Z'),
      4,
    );
    expect(runs.map((date) => chicagoStamp(date))).toEqual([
      '2026-01-31 20:00',
      '2026-02-28 20:00',
      '2026-03-31 20:00',
      '2026-04-30 20:00',
    ]);
    const fields = rowFieldsFromSpec(
      { time: '20:00', date: '2026-01-31', repeat: 'monthly' },
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(fields.scheduled_date).toBe('2026-01-31');
  });
});

test('a daily 2:30 AM shifts across the Chicago spring-forward and returns to 2:30', () => {
  // 14 Mar 2027 is the morning the clocks skip 2:00–2:59. A repeat must not throw.
  withUtcProcess(() => {
    const saturday = parseScheduledTime('2027-03-13', '2:30 AM', CHICAGO);
    const gap = calculateNextRun(saturday, 'weekly', EVERY_DAY, null, '2:30 AM');
    const monday = calculateNextRun(gap, 'weekly', EVERY_DAY, null, '2:30 AM');
    expect(gap.toISOString()).toBe('2027-03-14T08:30:00.000Z');
    expect(chicagoStamp(gap)).toBe('2027-03-14 03:30');
    expect(monday.toISOString()).toBe('2027-03-15T07:30:00.000Z');
    expect(chicagoStamp(monday)).toBe('2027-03-15 02:30');

    const sunday = parseScheduledTime('2027-03-07', '2:30 AM', CHICAGO);
    const skippedSunday = calculateNextRun(sunday, 'weekly', { s: true }, null, '2:30 AM');
    const nextSunday = calculateNextRun(skippedSunday, 'weekly', { s: true }, null, '2:30 AM');
    expect(chicagoStamp(skippedSunday)).toBe('2027-03-14 03:30');
    expect(chicagoStamp(nextSunday)).toBe('2027-03-21 02:30');

    const february = parseScheduledTime('2027-02-14', '2:30 AM', CHICAGO);
    const march = calculateNextRun(february, 'monthly', 14, null, '2:30 AM');
    const april = calculateNextRun(march, 'monthly', 14, null, '2:30 AM');
    expect(chicagoStamp(march)).toBe('2027-03-14 03:30');
    expect(chicagoStamp(april)).toBe('2027-04-14 02:30');

    const caughtUp = nextRunAfter(
      saturday,
      'weekly',
      EVERY_DAY,
      new Date('2027-03-15T17:00:00Z'),
      null,
      '2:30 AM',
    );
    expect(caughtUp.toISOString()).toBe('2027-03-16T07:30:00.000Z');
    expect(chicagoStamp(caughtUp)).toBe('2027-03-16 02:30');
  });
});

test('the monthly preview shifts the spring-forward hole instead of skipping the month', () => {
  withUtcProcess(() => {
    const runs = upcomingRuns(
      { time: '02:30', date: '2027-02-14', repeat: 'monthly' },
      new Date('2027-02-01T00:00:00Z'),
      3,
    );
    expect(runs.map((date) => chicagoStamp(date))).toEqual([
      '2027-02-14 02:30',
      '2027-03-14 03:30',
      '2027-04-14 02:30',
    ]);
  });
});

test('a saved row with no time zone still repeats on the Chicago clock, not UTC', () => {
  withUtcProcess(() => {
    const start = parseScheduledTime('2026-11-09', '9:00 PM', CHICAGO);
    const next = calculateNextRun(start, 'weekly', MONDAY, null);
    expect(chicagoWall(next)).toBe('Mon 21:00');
    expect(next.toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });
});
