import { localDay } from '../../lib/schedule/plainWords.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Google gives timed events as full times and all-day events as a bare date.
// Events are filed under the day on this computer's clock (an 8 pm event used
// to land on the next day for anyone west of London), and an all-day event
// keeps its own date and says "All day" instead of a made-up 7 pm time.
// An event from this person's own calendar (`source: 'own'`) has no Google
// link and takes the accent colour. `at` is when it starts on this computer's
// clock (an all-day event at the start of its day), for putting events in order.
export function toCalendarEvent(ev, { dayOf = localDay } = {}) {
  const allDay = DATE_ONLY.test(String(ev.start || ''));
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const own = ev.source === 'own';
  const at = (allDay ? new Date(`${ev.start}T00:00:00`) : start).getTime();
  return {
    id: ev.id,
    key: `${own ? 'own' : 'google'}:${ev.id}`,
    source: own ? 'own' : 'google',
    title: ev.title,
    description: ev.description,
    time: allDay ? 'All day' : `${clock(start)} - ${clock(end)}`,
    date: allDay ? ev.start : dayOf(start),
    at: Number.isFinite(at) ? at : 0,
    link: own ? null : ev.link,
    color: own ? 'var(--accent)' : ev.color || 'var(--ps-blue)',
  };
}
