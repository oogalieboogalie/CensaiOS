// Spec 7: tools for the Real Estate Team board's agents. None of them sends
// anything outside the board: client messages go to the Outbox, where a
// person approves them.
export const realEstateTools = [
  {
    type: 'function',
    function: {
      name: 'fair_housing_check',
      description: 'Check listing or client-facing text for US fair-housing risks (words that describe who should live in a home rather than the home). Returns each flagged phrase with the reason and a safer rewrite. Run it on every listing description, social post and client message before handing it over.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The text to check (max 8000 chars)' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_team_chat',
      description: 'Post a short message in this board\'s Team Chat window, which the whole team sees live. Use it for deadline reminders and handoffs. Never for client messages.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The message, one to three sentences (max 1000 chars)' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_client_message',
      description: 'Draft an email or text to a client or lead. The draft goes to this board\'s Outbox and waits there until a teammate approves, edits or discards it; nothing is sent by this tool. Always tell the user the draft is waiting in the Outbox.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['email', 'text'], description: 'email or text' },
          to: { type: 'string', description: 'Recipient name' },
          address: { type: 'string', description: 'Email address or phone number, if known' },
          subject: { type: 'string', description: 'Email subject (emails only)' },
          body: { type: 'string', description: 'The message (max 4000 chars)' },
          deal: { type: 'string', description: 'Which deal or listing it is about, e.g. "14 Alder Way"' },
        },
        required: ['channel', 'to', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deal_deadlines',
      description: 'List open contract deadlines from this board\'s Deal pipeline (inspection, appraisal, financing, walkthrough, closing), overdue first, within the next N days.',
      parameters: {
        type: 'object',
        properties: { days_ahead: { type: 'number', description: 'How many days ahead to look (default 7, max 60)' } },
      },
    },
  },
];
