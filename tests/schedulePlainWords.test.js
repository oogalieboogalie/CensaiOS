import { clockWords, describeEvery, describeSchedule, from12h, to12h, upcomingEvery, upcomingRuns, whenWords } from '../src/lib/schedule/plainWords.js';
import { describeRow, nextRunOf, rowFieldsFromSpec, specFromRow } from '../src/lib/schedule/fromScheduler.js';

// Wednesday 14 October 2026, 08:00 local.
const NOW = new Date(2026, 9, 14, 8, 0, 0);

describe('schedule plain words', () => {
  test('clock times read like people say them', () => {
    expect(clockWords('09:00')).toBe('9:00 AM');
    expect(clockWords('13:05')).toBe('1:05 PM');
    expect(clockWords('12:00')).toBe('noon');
    expect(from12h('12:45 AM')).toBe('00:45');
    expect(from12h('07:30 PM')).toBe('19:30');
    expect(to12h('00:15')).toBe('12:15 AM');
  });

  test('repeating schedules become one sentence, never cron', () => {
    expect(describeSchedule({ time: '09:00', repeat: 'weekdays' }, NOW)).toBe('Every weekday at 9:00 AM');
    expect(describeSchedule({ time: '18:30', repeat: 'daily' }, NOW)).toBe('Every day at 6:30 PM');
    expect(describeSchedule({ time: '07:00', repeat: 'days', days: [3, 1] }, NOW)).toBe('Every Mon, Wed at 7:00 AM');
    expect(describeSchedule({ time: '07:00', repeat: 'days', days: [5] }, NOW)).toBe('Every Friday at 7:00 AM');
    expect(describeSchedule({ time: '17:00', date: '2026-10-03', repeat: 'monthly' }, NOW)).toBe('Monthly on the 3rd at 5:00 PM');
    expect(describeSchedule({ time: '09:00', date: '2026-10-15', repeat: 'once' }, NOW)).toBe('Once, tomorrow at 9:00 AM');
  });

  test('upcoming runs skip days that are not picked', () => {
    const runs = upcomingRuns({ time: '07:30', date: '2026-10-14', repeat: 'weekdays' }, new Date(2026, 9, 16, 9, 0), 3);
    expect(runs.map((d) => d.getDay())).toEqual([1, 2, 3]); // Fri 9:00 is past 7:30, so Mon, Tue, Wed
    expect(upcomingRuns({ time: '07:00', date: '2026-10-13', repeat: 'once' }, NOW)).toEqual([]);
  });

  test('every-so-often starts', () => {
    expect(describeEvery(15)).toBe('Every 15 minutes');
    expect(describeEvery(60)).toBe('Every hour');
    expect(describeEvery(360)).toBe('Every 6 hours');
    expect(describeEvery(1440)).toBe('Every day');
    const runs = upcomingEvery(60, '2026-10-14T09:00:00', 3);
    expect(runs[2].getTime() - runs[0].getTime()).toBe(2 * 3600000);
  });

  test('when words', () => {
    expect(whenWords(new Date(2026, 9, 14, 17, 0), NOW)).toBe('Today at 5:00 PM');
    expect(whenWords(new Date(2026, 9, 16, 7, 30), NOW)).toBe('Friday at 7:30 AM');
  });
});

describe('scheduler rows', () => {
  const row = { scheduled_time: '09:00 AM', scheduled_date: '2026-10-10', repeat_enabled: true, repeat_freq: 'weekly',
    repeat_days: { s: false, m: true, t: true, w: true, th: true, f: true, sat: false }, status: 'active' };

  test('a saved row reads in plain words', () => {
    expect(specFromRow(row).repeat).toBe('weekdays');
    expect(describeRow(row, NOW)).toBe('Every weekday at 9:00 AM');
  });

  test('saving moves the start date to the first real run', () => {
    // Picked on a Saturday for weekdays: the first run is Monday.
    const fields = rowFieldsFromSpec({ time: '09:00', date: '2026-10-17', repeat: 'weekdays' }, NOW);
    expect(fields).toMatchObject({ scheduled_time: '09:00 AM', scheduled_date: '2026-10-19', repeat_enabled: true, repeat_freq: 'weekly' });
    expect(fields.repeat_days).toMatchObject({ s: false, m: true, f: true, sat: false });
    expect(rowFieldsFromSpec({ time: '17:00', date: '2026-10-14', repeat: 'once' }, NOW)).toMatchObject({ repeat_enabled: false, repeat_days: null, repeat_freq: null });
  });

  test('paused rows have no next run', () => {
    expect(nextRunOf({ ...row, status: 'inactive' }, NOW)).toBeNull();
    expect(nextRunOf({ ...row, next_run_at: '2026-10-15T09:00:00' }, NOW).getDate()).toBe(15);
  });
});
