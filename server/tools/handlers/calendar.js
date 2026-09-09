import { getCalendarEventsInternal, addCalendarEventInternal } from '../../calendar.js';

export async function handleCalendarTool(agentId, name, args, context = {}) {
  const userId = context.userId;
  switch (name) {
    case 'read_calendar': {
      const events = await getCalendarEventsInternal(userId, args);
      return JSON.stringify(events, null, 2);
    }
    case 'add_calendar_event': {
      const result = await addCalendarEventInternal(userId, args);
      return JSON.stringify(result);
    }

    default:
      throw new Error(`Unknown calendar tool: ${name}`);
  }
}
