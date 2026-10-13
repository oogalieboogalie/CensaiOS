/**
 * Parses a "HH:MM AM/PM" time string and a "YYYY-MM-DD" date string
 * into a Date object (in local server time).
 */
export function parseScheduledTime(dateStr, timeStr) {
  // timeStr: "12:45 PM"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) return new Date(`${dateStr}T12:00:00`);

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];

  if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
  if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

  const iso = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  return new Date(iso);
}

export function calculateNextRun(currentRunAt, freq, days) {
  const next = new Date(currentRunAt);
  if (freq === 'monthly') {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  // Weekly: find next occurrence based on days {s, m, t, w, th, f, sat}
  const dayMap = { s: 0, m: 1, t: 2, w: 3, th: 4, f: 5, sat: 6 };
  const targetDays = Object.entries(days || {})
    .filter((entry) => entry[1])
    .map(([day]) => dayMap[day])
    .sort();

  if (targetDays.length === 0) {
    next.setDate(next.getDate() + 7);
    return next;
  }

  const currentDay = next.getDay();
  // Find first target day that is AFTER currentDay
  const nextDay = targetDays.find(d => d > currentDay);

  if (nextDay !== undefined) {
    next.setDate(next.getDate() + (nextDay - currentDay));
  } else {
    // Wrap to next week
    next.setDate(next.getDate() + (7 - currentDay + targetDays[0]));
  }
  return next;
}
