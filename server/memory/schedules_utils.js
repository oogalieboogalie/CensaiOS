/**
 * Turns a calendar date and a clock time into the instant the person meant.
 * The app does not store a time zone. Chat already learns it from the browser
 * (`timeZone` on the request), and a new schedule sends that same field.
 * When a caller leaves it out, LOCAL_DEV_TIME_ZONE is the configured clock,
 * and America/Chicago is the default local-dev restarts already use.
 * Repeats, including the monthly clamp to the last day and the return to the
 * original day, step on that same calendar (shared/schedule/zoneTime.js).
 * The zone is not stored on the row, and the server process zone is not used.
 */
import {
  configuredScheduleZone,
  instantInZone,
  knownZone,
  nextInstantOnZoneCalendar,
  pinnedMonthDay,
  zoneParts,
} from '../../shared/schedule/zoneTime.js';

function scheduleInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function clip(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function scheduleZone(timeZone) {
  if (timeZone != null && String(timeZone).trim() !== '') {
    const named = knownZone(timeZone);
    if (!named) {
      throw scheduleInputError('That time zone is not recognized. Use one like America/Chicago.');
    }
    return named;
  }
  return configuredScheduleZone();
}

function readDate(dateStr) {
  const match = String(dateStr ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = match ? Number(match[1]) : NaN;
  const month = match ? Number(match[2]) : NaN;
  const day = match ? Number(match[3]) : NaN;
  const probe = match ? new Date(Date.UTC(year, month - 1, day)) : null;
  const real = probe
    && probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
  if (!real) {
    const shown = clip(dateStr) || 'missing';
    throw scheduleInputError(`Could not read "${shown}" as a date. Use a date like 2026-11-10.`);
  }
  return { year, month, day };
}

function readClock(timeStr) {
  if (timeStr == null || String(timeStr).trim() === '') {
    throw scheduleInputError('A schedule needs a time, like 9:00 AM.');
  }
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) {
    throw scheduleInputError(`Could not read "${clip(timeStr)}" as a time. Use 9:00 AM or 09:00.`);
  }
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = (match[3] || '').toUpperCase();
  const badHour = minutes > 59 || (ampm ? hours < 1 || hours > 12 : hours > 23);
  if (badHour) {
    throw scheduleInputError(`Could not read "${clip(timeStr)}" as a time. Use 9:00 AM or 09:00.`);
  }
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

export function parseScheduledTime(dateStr, timeStr, timeZone) {
  const date = readDate(dateStr);
  const clock = readClock(timeStr);
  const instant = instantInZone({ ...date, ...clock }, scheduleZone(timeZone));
  if (!instant) {
    throw scheduleInputError('That time does not exist on that date in this time zone.');
  }
  return instant;
}

/**
 * The day of the month a monthly schedule was set for.
 * A stored "YYYY-MM-DD" is read from the digits, so the process zone cannot
 * move a 31st to the day before. A Date uses that Date's own calendar day.
 */
export function monthlyAnchorDay(value) {
  const direct = pinnedMonthDay(value);
  if (direct) return direct;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return pinnedMonthDay(value.getDate());
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? pinnedMonthDay(Number(match[3])) : null;
}

/** Saved "2:30 AM", or null when the row has no readable time. */
function savedClock(scheduledTime) {
  if (scheduledTime == null || String(scheduledTime).trim() === '') return null;
  try {
    return readClock(scheduledTime);
  } catch {
    return null;
  }
}

export function calculateNextRun(currentRunAt, freq, days, timeZone, scheduledTime) {
  const next = nextInstantOnZoneCalendar(currentRunAt, freq, days, timeZone, savedClock(scheduledTime));
  if (!next) {
    throw scheduleInputError('That time does not exist on that date in this time zone.');
  }
  return next;
}

/**
 * The next repeat that is still ahead of `now`. A repeating schedule whose
 * last run was long ago (its date set in the past, or the computer off for a
 * week) used to step forward only one repeat per run, so it fired again on
 * every check until it caught up. Capped so a broken row cannot loop forever.
 */
export function nextRunAfter(currentRunAt, freq, days, now = new Date(), timeZone, scheduledTime) {
  const saved = savedClock(scheduledTime);
  const wall = zoneParts(new Date(currentRunAt), configuredScheduleZone(timeZone));
  const clock = saved || { hours: wall.hours, minutes: wall.minutes };
  let next = nextInstantOnZoneCalendar(currentRunAt, freq, days, timeZone, clock);
  if (!next) {
    throw scheduleInputError('That time does not exist on that date in this time zone.');
  }
  for (let i = 0; i < 1000 && next <= now; i += 1) {
    const stepped = nextInstantOnZoneCalendar(next, freq, days, timeZone, clock);
    if (!stepped) {
      throw scheduleInputError('That time does not exist on that date in this time zone.');
    }
    next = stepped;
  }
  return next;
}
