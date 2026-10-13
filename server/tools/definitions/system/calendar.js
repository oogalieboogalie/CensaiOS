export const calendarTools = [
  {
    type: 'function',
    function: {
      name: 'read_calendar',
      description: 'Fetch the next 7 days of events from the Google Calendar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: 'Add a new event to the Google Calendar.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the event' },
          start: { type: 'string', description: 'Start time (ISO 8601, e.g. 2026-05-24T10:00:00Z)' },
          end: { type: 'string', description: 'End time (ISO 8601)' },
          description: { type: 'string', description: 'Optional event description' },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
];
