// Speak up (diagram 17): one short note to the Inbox, on the agent's own.
export const speakUpTools = [
  {
    type: 'function',
    function: {
      name: 'speak_up',
      description: 'Post one short note to the person\'s Inbox on your own, without being asked. Use it only when a scheduled check finds something they would want to know now (something broke, a deadline is close, a result came in). One or two plain sentences. It only works when the person turned Speak up on for you, and at most once an hour.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'The note, one or two plain sentences (280 characters at most).' },
        },
        required: ['note'],
      },
    },
  },
];
