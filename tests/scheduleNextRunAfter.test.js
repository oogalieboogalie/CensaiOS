// Also: a repeat the table does not know ("every 0 minutes") used to come back as a 500.
// A daily schedule whose date was set a week back (item 145's bug hunt) used
// to move forward one day per run and fire again on every check until it
// caught up. Its next run must land after now.
import { calculateNextRun, nextRunAfter } from '../server/memory/schedules_utils.js';

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

test('a repeat the table does not know is a plain refusal, not a server error', async () => {
  const { createSchedule } = await import('../server/scheduler/store.js');
  const db = { query: async () => { throw new Error('should not reach the table'); } };
  await expect(createSchedule({
    agent_id: 'atlas', task_text: 'Made-up: every zero minutes', repeat_enabled: true, repeat_freq: 'minutes',
    scheduled_date: '2026-10-24', scheduled_time: '9:00 AM',
  }, { db, userId: 7, workspaceId: 'w1' })).rejects.toMatchObject({ statusCode: 422 });
});
