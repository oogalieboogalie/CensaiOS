// Schedule repeats step on a civil calendar, then become an instant.
// The calendar is LOCAL_DEV_TIME_ZONE, or America/Chicago when that is unset.
// It is never the process zone: Docker leaves TZ unset, so that zone is UTC
// and an evening time is already the next day there. Counting months with
// Date#setMonth follows that process zone and skips a month (Jan 31 at 8 PM
// becomes Mar 30; Oct 31 at 11:30 PM skips November).
// A 29th, 30th or 31st clamps to the month's last day and returns to the
// original day when a later month has room for it.

export const DEFAULT_SCHEDULE_ZONE = 'America/Chicago';

export function knownZone(zone) {
  const name = String(zone ?? '').trim();
  if (!name || name.length > 64) return '';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return '';
  }
}

/** Explicit zone, then LOCAL_DEV_TIME_ZONE, then America/Chicago. */
export function configuredScheduleZone(timeZone) {
  return knownZone(timeZone)
    || knownZone(typeof process !== 'undefined' ? process.env.LOCAL_DEV_TIME_ZONE : '')
    || DEFAULT_SCHEDULE_ZONE;
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let hour = Number(value.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hours: hour,
    minutes: Number(value.minute),
    seconds: Number(value.second),
  };
}

function zoneWallAsUtc(date, timeZone) {
  const part = zoneParts(date, timeZone);
  return Date.UTC(part.year, part.month - 1, part.day, part.hours, part.minutes, part.seconds);
}

/** The instant for this wall clock, or null when the clocks skip that minute. */
export function instantInZone({ year, month, day, hours, minutes }, timeZone) {
  const wanted = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let utc = wanted;
  let found = null;
  for (let i = 0; i < 3; i += 1) {
    const shown = zoneWallAsUtc(new Date(utc), timeZone);
    const delta = wanted - shown;
    if (delta === 0) {
      found = utc;
      break;
    }
    utc += delta;
  }
  if (found == null) return null;
  // The same wall time happens twice when clocks fall back. Keep the earlier one.
  const first = found;
  for (const back of [30, 60, 90, 120]) {
    const candidate = first - back * 60 * 1000;
    if (zoneWallAsUtc(new Date(candidate), timeZone) === wanted) found = candidate;
  }
  return new Date(found);
}

function addWallMinutes(parts, delta) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, 0) + delta * 60 * 1000);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hours: next.getUTCHours(),
    minutes: next.getUTCMinutes(),
  };
}

/**
 * The wall time, or that minute shifted across a spring-forward hole.
 * Chicago skips 2:00–2:59, so 2:30 is kept as 3:30. Creating a schedule
 * still refuses the hole; only repeats use this.
 */
export function instantInZoneOrAcrossGap(parts, timeZone) {
  const exact = instantInZone(parts, timeZone);
  if (exact) return exact;
  const wantedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, 0);
  for (let back = 1; back <= 180; back += 1) {
    const earlier = addWallMinutes(parts, -back);
    const hit = instantInZone(earlier, timeZone);
    if (!hit) continue;
    const earlierUtc = Date.UTC(earlier.year, earlier.month - 1, earlier.day, earlier.hours, earlier.minutes, 0);
    return new Date(wantedUtc + (hit.getTime() - earlierUtc));
  }
  return null;
}

export function pinnedMonthDay(value) {
  return Number.isInteger(value) && value >= 1 && value <= 31 ? value : null;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The next calendar month, clamped to that month's last day. */
export function nextCivilMonth(year, month, wantedDay) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    year: nextYear,
    month: nextMonth,
    day: Math.min(wantedDay, daysInMonth(nextYear, nextMonth)),
  };
}

function shiftCivilDay(year, month, day, by) {
  const next = new Date(Date.UTC(year, month - 1, day + by));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/**
 * The next repeat after `currentRunAt`, on the configured zone's calendar.
 * Monthly `days` may be the original day (29, 30 or 31). `clock` is the
 * saved time (hours and minutes). Later runs use that, not the wall clock
 * of a spring-forward shift, so 2:30 returns the day after 3:30.
 * Returns null only when the time still cannot be placed.
 */
export function nextInstantOnZoneCalendar(currentRunAt, freq, days, timeZone, clock) {
  const zone = configuredScheduleZone(timeZone);
  const wall = zoneParts(new Date(currentRunAt), zone);
  const hours = Number.isInteger(clock?.hours) ? clock.hours : wall.hours;
  const minutes = Number.isInteger(clock?.minutes) ? clock.minutes : wall.minutes;
  if (freq === 'monthly') {
    const wanted = pinnedMonthDay(days) ?? wall.day;
    const next = nextCivilMonth(wall.year, wall.month, wanted);
    return instantInZoneOrAcrossGap({ ...next, hours, minutes }, zone);
  }

  // Weekly, including every day and weekdays: {s, m, t, w, th, f, sat}
  const dayMap = { s: 0, m: 1, t: 2, w: 3, th: 4, f: 5, sat: 6 };
  const targetDays = Object.entries(days || {})
    .filter((entry) => entry[1])
    .map(([day]) => dayMap[day])
    .filter((day) => day !== undefined)
    .sort((a, b) => a - b);
  const today = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  let step = 7;
  if (targetDays.length) {
    const nextDay = targetDays.find((day) => day > today);
    step = nextDay !== undefined ? nextDay - today : (7 - today + targetDays[0]);
  }
  const shifted = shiftCivilDay(wall.year, wall.month, wall.day, step);
  return instantInZoneOrAcrossGap({ ...shifted, hours, minutes }, zone);
}

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" of `date` on the configured schedule calendar. */
export function zoneDateString(date, timeZone) {
  const part = zoneParts(new Date(date), configuredScheduleZone(timeZone));
  return `${part.year}-${pad(part.month)}-${pad(part.day)}`;
}

/**
 * The next monthly runs at one wall clock, including the first date when it
 * is still at or after `from`. Same clamp as a saved monthly schedule.
 */
export function upcomingMonthlyInstants({ date, hours, minutes, from = new Date(), count = 3, timeZone } = {}) {
  const zone = configuredScheduleZone(timeZone);
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return [];
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return [];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').slice(0, 10));
  if (date && !match) return [];
  const origin = zoneParts(start, zone);
  let year = match ? Number(match[1]) : origin.year;
  let month = match ? Number(match[2]) : origin.month;
  const anchor = match ? Number(match[3]) : origin.day;
  if (!pinnedMonthDay(anchor)) return [];
  let day = Math.min(anchor, daysInMonth(year, month));
  const runs = [];
  for (let i = 0; runs.length < count && i < 36; i += 1) {
    const instant = instantInZoneOrAcrossGap({ year, month, day, hours, minutes }, zone);
    if (instant && instant >= start) runs.push(instant);
    const stepped = nextCivilMonth(year, month, anchor);
    year = stepped.year;
    month = stepped.month;
    day = stepped.day;
  }
  return runs;
}
