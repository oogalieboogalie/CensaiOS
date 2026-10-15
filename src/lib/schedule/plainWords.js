// One shared way to describe a schedule in plain words and work out when it
// runs next. Every scheduling screen (Scheduler, Workflow start, Calendar,
// Live Operations) reads from here so they all speak the same language:
// "Every weekday at 9:00 AM", "Tomorrow at 7:30 AM", "Every 6 hours".

export const DAY_KEYS = Object.freeze(['s', 'm', 't', 'w', 'th', 'f', 'sat']);
export const DAY_SHORT = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const DAY_LONG = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const WEEKDAYS = [1, 2, 3, 4, 5];

/** How often a timed schedule repeats, as the pickers offer it. */
export const REPEAT_CHOICES = Object.freeze([
  ['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['days', 'Pick days'], ['monthly', 'Monthly'],
]);

/** Ready-made gaps for "every so often" starts, in minutes. */
export const EVERY_CHOICES = Object.freeze([15, 30, 60, 360, 1440]);

const pad = (n) => String(n).padStart(2, '0');

/** "13:05" → "1:05 PM". */
export function clockWords(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  if (h === 12 && m === 0) return 'noon';
  if (h === 0 && m === 0) return 'midnight';
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "09:30 PM" (what the scheduler API stores) ⇄ "21:30". */
export function from12h(text) {
  const match = String(text || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '09:00';
  let h = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') h += 12;
  return `${pad(h)}:${match[2]}`;
}

export function to12h(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  return `${pad(h % 12 || 12)}:${pad(m || 0)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Local "YYYY-MM-DD" for a Date (toISOString would shift it to UTC). */
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The picked weekdays (0 = Sunday) for a repeat choice. */
export function daysFor(repeat, days = []) {
  if (repeat === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  if (repeat === 'weekdays') return WEEKDAYS;
  if (repeat === 'days') return [...new Set(days)].sort((a, b) => a - b);
  return [];
}

function daysWords(days) {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return 'Every weekday';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Every weekend';
  if (days.length === 1) return `Every ${DAY_LONG[days[0]]}`;
  return `Every ${days.map((d) => DAY_SHORT[d]).join(', ')}`;
}

function ordinal(n) {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${tail}`;
}

/**
 * A timed schedule in one sentence.
 * spec: { time: "HH:MM", date: "YYYY-MM-DD", repeat: once|daily|weekdays|days|monthly, days: [0-6] }
 */
export function describeSchedule(spec, now = new Date()) {
  const at = clockWords(spec.time);
  if (spec.repeat === 'monthly') {
    const day = Number(String(spec.date || '').slice(8, 10)) || now.getDate();
    return `Monthly on the ${ordinal(day)} at ${at}`;
  }
  if (spec.repeat === 'once' || !spec.repeat) {
    const when = spec.date ? new Date(`${spec.date}T${spec.time || '09:00'}:00`) : null;
    return when && !Number.isNaN(when.getTime()) ? `Once, ${whenWords(when, now, { capital: false })}` : `Once at ${at}`;
  }
  const days = daysFor(spec.repeat, spec.days);
  if (!days.length) return 'Pick at least one day';
  return `${daysWords(days)} at ${at}`;
}

/** The next `count` times a timed schedule runs, starting at or after `from`. */
export function upcomingRuns(spec, from = new Date(), count = 3) {
  const [h, m] = String(spec.time || '09:00').split(':').map(Number);
  const start = spec.date ? new Date(`${spec.date}T00:00:00`) : new Date(from);
  if (Number.isNaN(start.getTime())) return [];
  start.setHours(h, m, 0, 0);
  if (spec.repeat === 'once' || !spec.repeat) return start >= from ? [start] : [];
  const runs = [];
  if (spec.repeat === 'monthly') {
    const cursor = new Date(start);
    for (let i = 0; runs.length < count && i < 36; i += 1) {
      if (cursor >= from) runs.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return runs;
  }
  const days = daysFor(spec.repeat, spec.days);
  if (!days.length) return [];
  const cursor = new Date(Math.max(start.getTime(), new Date(from).setHours(0, 0, 0, 0)));
  cursor.setHours(h, m, 0, 0);
  for (let i = 0; runs.length < count && i < 400; i += 1) {
    if (days.includes(cursor.getDay()) && cursor >= from && cursor >= start) runs.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return runs;
}

/** "Every 15 minutes", "Every hour", "Every 6 hours", "Every day". */
export function describeEvery(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return 'Pick how often';
  if (n % 1440 === 0) return n === 1440 ? 'Every day' : `Every ${n / 1440} days`;
  if (n % 60 === 0) return n === 60 ? 'Every hour' : `Every ${n / 60} hours`;
  return `Every ${n} minutes`;
}

/** Short chip label for a gap: "15 min", "1 hour", "6 hours", "1 day". */
export function everyChip(minutes) {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} min`;
}

/** The next `count` runs of an "every N minutes" start. */
export function upcomingEvery(minutes, nextRunAt, count = 3, now = new Date()) {
  const gap = Number(minutes) * 60000;
  if (!Number.isFinite(gap) || gap <= 0) return [];
  let first = nextRunAt ? new Date(nextRunAt).getTime() : now.getTime() + gap;
  if (!Number.isFinite(first)) first = now.getTime() + gap;
  return Array.from({ length: count }, (_, i) => new Date(first + i * gap));
}

/** "Today at 9:00 AM", "Tomorrow at 7:30 AM", "Thu, Oct 16 at 5:00 PM". */
export function whenWords(date, now = new Date(), { capital = true } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const at = clockWords(`${d.getHours()}:${d.getMinutes()}`);
  const dayGap = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  let day;
  if (dayGap === 0) day = 'today';
  else if (dayGap === 1) day = 'tomorrow';
  else if (dayGap === -1) day = 'yesterday';
  else if (dayGap > 1 && dayGap < 7) day = DAY_LONG[d.getDay()];
  else day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  const text = `${day} at ${at}`;
  return capital ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "in 5 min", "in 3 hours", "in 2 days", "5 min ago". */
export function fromNow(date, now = new Date()) {
  const diff = new Date(date).getTime() - now.getTime();
  if (!Number.isFinite(diff)) return '';
  const mins = Math.round(Math.abs(diff) / 60000);
  let span;
  if (mins < 1) return diff >= 0 ? 'any moment' : 'just now';
  if (mins < 60) span = `${mins} min`;
  else if (mins < 1440) span = `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? '' : 's'}`;
  else span = `${Math.round(mins / 1440)} day${Math.round(mins / 1440) === 1 ? '' : 's'}`;
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}

/** Which heading a run sits under in an upcoming list. */
export function dayBucket(date, now = new Date()) {
  const gap = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (gap <= 0) return 'Today';
  if (gap === 1) return 'Tomorrow';
  if (gap < 7) return 'This week';
  return 'Later';
}
