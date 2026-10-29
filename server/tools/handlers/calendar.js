import { getCalendarEventsInternal, addCalendarEventInternal, NOT_CONNECTED } from '../../calendar.js';
import { dbReady } from '../../dbState.js';
import { addEvent, listEvents, normalizeEventInput } from '../../ownCalendar/store.js';

// The person's own calendar works without Google, and Google Calendar joins
// in once it is connected: reading shows both, and adding goes to Google
// when it is connected, otherwise to their own calendar.
async function ownCalendar(userId) {
  if (!userId || !dbReady()) return null;
  return (await import('../../db.js')).default;
}

const byStart = (a, b) => new Date(a.start) - new Date(b.start);

export async function handleCalendarTool(agentId, name, args, context = {}) {
  const userId = context.userId;
  switch (name) {
    case 'read_calendar': {
      const db = await ownCalendar(userId);
      const own = db ? await listEvents(db, userId, args || {}) : [];
      const google = await getCalendarEventsInternal(userId, args).catch((err) => {
        if (err.message === NOT_CONNECTED && db) return [];
        throw err;
      });
      return JSON.stringify([...own, ...google].sort(byStart), null, 2);
    }
    case 'add_calendar_event': {
      try {
        return JSON.stringify(await addCalendarEventInternal(userId, args));
      } catch (err) {
        if (err.message !== NOT_CONNECTED) throw err;
        const db = await ownCalendar(userId);
        if (!db) throw err;
        const event = await addEvent(db, userId, normalizeEventInput(args));
        return JSON.stringify({ ok: true, calendar: 'own', eventId: event.id });
      }
    }

    default:
      throw new Error(`Unknown calendar tool: ${name}`);
  }
}
