// Each person's own calendar (server/ownCalendar/routes.js): the events the
// Calendar window keeps without Google.

async function answer(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || fallback), { status: res.status });
  return data;
}

/** My events between two ISO times. */
export async function getMyCalendarEvents(start, end) {
  const res = await fetch(`/api/my-calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  return (await answer(res, 'Your calendar could not be loaded.')).events || [];
}

/** Adds { title, start, end, description } to my calendar; returns the event. */
export async function addMyCalendarEvent(event) {
  const res = await fetch('/api/my-calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return (await answer(res, 'The event could not be added.')).event;
}

export async function deleteMyCalendarEvent(id) {
  const res = await fetch(`/api/my-calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await answer(res, 'The event could not be deleted.');
}
