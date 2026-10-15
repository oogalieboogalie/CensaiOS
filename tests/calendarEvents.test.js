import { toCalendarEvent } from '../src/components/calendar/calendarEvents.js';

// The day as a computer in US Central time (UTC-5 in October, like Alex's PC) sees it.
const centralDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);

describe('calendar events land on the right day', () => {
  test('an 8 pm event stays on its own day instead of the next one', () => {
    const ev = toCalendarEvent(
      { id: 'e1', title: 'Showing', start: '2026-10-15T20:00:00-05:00', end: '2026-10-15T21:00:00-05:00' },
      { dayOf: centralDay },
    );
    expect(ev.date).toBe('2026-10-15');
    expect(ev.time).not.toBe('All day');
  });

  test('an all-day event keeps its date and says All day', () => {
    const ev = toCalendarEvent({ id: 'e2', title: 'Open house', start: '2026-10-20', end: '2026-10-21' }, { dayOf: centralDay });
    expect(ev).toMatchObject({ date: '2026-10-20', time: 'All day' });
  });
});
