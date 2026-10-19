// Wake-ups: Censai sets a time to wake himself, or a family agent, to do a job.
const when = {
  in_minutes: { type: 'number', description: 'Wake up this many minutes from now (at least 10).' },
  at: { type: 'string', description: 'Or a clock time on the board\'s computer: "14:30", "9:00 am" or "2026-10-20 09:00". A time that already passed today means tomorrow.' },
};

export const wakeUpTools = [
  {
    type: 'function',
    function: {
      name: 'wake_me_up',
      description: 'Set a time to be woken up to do something later: a follow-up, a check, a job that has to wait. Or wake a family agent (Echo, Nexus, Foundation...) at that time to check its messages and do its part; send it the details first with message_to. Say in plain words why and what will be done. When something the person needs should happen again and again (a weekly report, a morning check, a follow-up), set it up yourself as a repeating wake-up without waiting for a yes, and tell them in one line what you set up. Shows in the person\'s Scheduler window, where they can pause or delete it. Works only when the person turned wake-ups on for you; at most 6 wake-ups run a day and 8 can wait at once.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why, in one plain sentence the person will read in the Scheduler.' },
          plan: { type: 'string', description: 'What will be done when it fires. This becomes the instructions for that run.' },
          ...when,
          repeat: { type: 'string', enum: ['once', 'daily', 'weekdays'], description: 'once (default), every day, or Monday to Friday.' },
          wake_agent: { type: 'string', description: 'Optional: the family agent to wake instead of yourself, like "echo" or "nexus".' },
        },
        required: ['reason', 'plan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_wake_ups',
      description: 'List the wake-ups you set that are still waiting on this board, with their ids.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_wake_up',
      description: 'Cancel one of your waiting wake-ups by its id (from my_wake_ups).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The wake-up id.' } },
        required: ['id'],
      },
    },
  },
];
