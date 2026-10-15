import { localDay } from '../../lib/schedule/plainWords.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Google gives timed events as full times and all-day events as a bare date.
// Events are filed under the day on this computer's clock (an 8 pm event used
// to land on the next day for anyone west of London), and an all-day event
// keeps its own date and says "All day" instead of a made-up 7 pm time.
export function toCalendarEvent(ev, { dayOf = localDay } = {}) {
  const allDay = DATE_ONLY.test(String(ev.start || ''));
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    time: allDay ? 'All day' : `${clock(start)} - ${clock(end)}`,
    date: allDay ? ev.start : dayOf(start),
    link: ev.link,
    color: ev.color,
  };
}
