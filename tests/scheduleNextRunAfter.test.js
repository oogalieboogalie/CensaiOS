// Also: a repeat the table does not know ("every 0 minutes") used to come back as a 500.
// A daily schedule whose date was set a week back (item 145's bug hunt) used
// to move forward one day per run and fire again on every check until it
// caught up. Its next run must land after now.
import { calculateNextRun, monthlyAnchorDay, nextRunAfter } from '../server/memory/schedules_utils.js';

const EVERY_DAY = { s: true, m: true, t: true, w: true, th: true, f: true, sat: true };
const now = new Date('2026-10-23T15:00:00Z');

test('a daily repeat set a week back jumps to the next day ahead, not one day on', () => {
  const weekAgo = new Date('2026-10-16T14:00:00Z');
  expect(calculateNextRun(weekAgo, 'weekly', EVERY_DAY) <= now).toBe(true);
  const next = nextRunAfter(weekAgo, 'weekly', EVERY_DAY, now);
  expect(next > now).toBe(true);
  expect(next - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
});

test('a repeat already ahead of now is the plain next one', () => {
  const at = new Date('2026-10-23T16:00:00Z');
  expect(nextRunAfter(at, 'monthly', null, now)).toEqual(calculateNextRun(at, 'monthly', null));
});

test('a broken row stops after the cap instead of looping forever', () => {
  const longAgo = new Date('1900-01-01T00:00:00Z');
  expect(() => nextRunAfter(longAgo, 'weekly', null, now)).not.toThrow();
});

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The day the schedule was set for is the third argument. Each step is one
// firing, the way the worker advances next_run_at.
function monthlyRun(start, day, steps) {
  let cursor = start;
  const landed = [];
  for (let i = 0; i < steps; i += 1) {
    cursor = calculateNextRun(cursor, 'monthly', day);
    landed.push(stamp(cursor));
  }
  return landed;
}

test('monthly on the 29th, 30th or 31st clamps to a short month and comes back', () => {
  const at = (y, m, d) => new Date(y, m, d, 9, 30, 0);
  // Jan 31 must not become Mar 3 and then stay on the 3rd.
  expect(monthlyRun(at(2026, 0, 31), 31, 5)).toEqual([
    '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
  ]);
  expect(monthlyRun(at(2026, 0, 30), 30, 4)).toEqual([
    '2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30',
  ]);
  expect(monthlyRun(at(2026, 0, 29), 29, 4)).toEqual([
    '2026-02-28', '2026-03-29', '2026-04-29', '2026-05-29',
  ]);
  // 2024 is a leap year: February has a 29th, and the 31st uses that day.
  expect(monthlyRun(at(2024, 0, 31), 31, 3)).toEqual([
    '2024-02-29', '2024-03-31', '2024-04-30',
  ]);
  expect(monthlyRun(at(2024, 0, 29), 29, 2)).toEqual([
    '2024-02-29', '2024-03-29',
  ]);
  const first = calculateNextRun(at(2026, 0, 31), 'monthly', 31);
  expect(first.getHours()).toBe(9);
  expect(first.getMinutes()).toBe(30);
});

test('a monthly 31st already shortened to April 30 returns to the 31st in May', () => {
  expect(stamp(calculateNextRun(new Date(2026, 3, 30, 9, 30, 0), 'monthly', 31))).toBe('2026-05-31');
});

test('a skipped monthly 31st catches up on the last day of the month, not the 3rd', () => {
  // The dates here are built on the process clock, so the repeat is read on
  // that same clock. Repeats otherwise use the configured schedule zone.
  const processZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const next = nextRunAfter(
    new Date(2026, 0, 31, 9, 30, 0),
    'monthly',
    31,
    new Date(2026, 3, 15, 8, 0, 0),
    processZone,
  );
  expect(stamp(next)).toBe('2026-04-30');
  expect(next.getHours()).toBe(9);
  expect(next.getMinutes()).toBe(30);
});

test('the saved start date is the day a short month returns to', () => {
  expect(monthlyAnchorDay('2026-01-31')).toBe(31);
  expect(monthlyAnchorDay(new Date(2026, 0, 29, 0, 0, 0))).toBe(29);
  expect(monthlyAnchorDay(null)).toBeNull();
  const day = monthlyAnchorDay('2026-01-31');
  const feb = calculateNextRun(new Date(2026, 0, 31, 9, 30, 0), 'monthly', day);
  const mar = calculateNextRun(feb, 'monthly', day);
  expect(stamp(feb)).toBe('2026-02-28');
  expect(stamp(mar)).toBe('2026-03-31');
});

test('a monthly day that exists in every month is unchanged, including a year wrap', () => {
  expect(monthlyRun(new Date(2026, 0, 15, 9, 30, 0), 15, 3)).toEqual([
    '2026-02-15', '2026-03-15', '2026-04-15',
  ]);
  expect(stamp(calculateNextRun(new Date(2026, 11, 31, 9, 30, 0), 'monthly', 31))).toBe('2027-01-31');
});

test('a repeat the table does not know is a plain refusal, not a server error', async () => {
  const { createSchedule } = await import('../server/scheduler/store.js');
  const db = { query: async () => { throw new Error('should not reach the table'); } };
  await expect(createSchedule({
    agent_id: 'atlas', task_text: 'Made-up: every zero minutes', repeat_enabled: true, repeat_freq: 'minutes',
    scheduled_date: '2026-10-24', scheduled_time: '9:00 AM',
  }, { db, userId: 7, workspaceId: 'w1' })).rejects.toMatchObject({ statusCode: 422 });
});
