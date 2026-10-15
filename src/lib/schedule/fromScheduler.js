// The Scheduler window's saved rows (server/scheduler/store.js) ⇄ the shared
// schedule shape in plainWords.js. The server keeps "HH:MM AM/PM", a start
// date, ticked days as { s, m, t, w, th, f, sat } and weekly or monthly.
import { DAY_KEYS, daysFor, describeSchedule, from12h, localDay, to12h, upcomingRuns } from './plainWords.js';

export function specFromRow(row) {
  const time = from12h(row.scheduled_time);
  const date = String(row.scheduled_date || '').slice(0, 10) || localDay();
  if (!row.repeat_enabled) return { time, date, repeat: 'once', days: [] };
  if (row.repeat_freq === 'monthly') return { time, date, repeat: 'monthly', days: [] };
  const days = DAY_KEYS.map((key, i) => (row.repeat_days?.[key] ? i : -1)).filter((i) => i >= 0);
  if (days.length === 7 || days.length === 0) return { time, date, repeat: 'daily', days };
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return { time, date, repeat: 'weekdays', days };
  return { time, date, repeat: 'days', days };
}

/** The fields the scheduler API wants. The start date moves to the first real run. */
export function rowFieldsFromSpec(spec, now = new Date()) {
  const first = upcomingRuns(spec, now, 1)[0];
  const repeating = spec.repeat !== 'once';
  const ticked = daysFor(spec.repeat, spec.days);
  return {
    scheduled_time: to12h(spec.time),
    scheduled_date: first ? localDay(first) : spec.date,
    repeat_enabled: repeating,
    repeat_days: repeating && spec.repeat !== 'monthly' ? Object.fromEntries(DAY_KEYS.map((key, i) => [key, ticked.includes(i)])) : null,
    repeat_freq: repeating ? (spec.repeat === 'monthly' ? 'monthly' : 'weekly') : null,
  };
}

export function describeRow(row, now = new Date()) {
  return describeSchedule(specFromRow(row), now);
}

/** When an active row runs next, or null when it is paused or finished. */
export function nextRunOf(row, now = new Date()) {
  if (row.status !== 'active' && row.status !== 'running') return null;
  const saved = row.next_run_at || row.nextRunAt;
  if (saved) {
    const d = new Date(saved);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return upcomingRuns(specFromRow(row), now, 1)[0] || null;
}
