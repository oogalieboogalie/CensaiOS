// Prints Chicago month-end stamps as JSON. Spawned with TZ set, so a UTC
// process and a Tokyo process can be compared. Not a Jest file.
import { calculateNextRun, monthlyAnchorDay, nextRunAfter, parseScheduledTime } from '../server/memory/schedules_utils.js';

const zone = 'America/Chicago';

function stamp(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`;
}

function monthly(date, time, day, steps) {
  let cursor = parseScheduledTime(date, time, zone);
  const landed = [];
  for (let i = 0; i < steps; i += 1) {
    cursor = calculateNextRun(cursor, 'monthly', day, zone, time);
    landed.push(stamp(cursor));
  }
  return landed;
}

process.stdout.write(JSON.stringify({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  d31: monthly('2026-01-31', '9:30 AM', 31, 5),
  d30: monthly('2026-01-30', '9:30 AM', 30, 4),
  d29: monthly('2026-01-29', '9:30 AM', 29, 4),
  leap31: monthly('2024-01-31', '9:30 AM', 31, 3),
  leap29: monthly('2024-01-29', '9:30 AM', 29, 2),
  back: stamp(calculateNextRun(parseScheduledTime('2026-04-30', '9:30 AM', zone), 'monthly', 31, zone, '9:30 AM')),
  catchup: stamp(nextRunAfter(parseScheduledTime('2026-01-31', '9:30 AM', zone), 'monthly', 31, new Date('2026-04-15T12:00:00Z'), zone, '9:30 AM')),
  plain: monthly('2026-01-15', '9:30 AM', 15, 3),
  year: stamp(calculateNextRun(parseScheduledTime('2026-12-31', '9:30 AM', zone), 'monthly', 31, zone, '9:30 AM')),
  anchor: [monthlyAnchorDay('2026-01-31'), monthlyAnchorDay(new Date(2026, 0, 29, 0, 0, 0)), monthlyAnchorDay(null)],
  evening: monthly('2026-01-31', '8:00 PM', 31, 3),
}));
