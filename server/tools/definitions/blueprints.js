export const blueprintTools = [
  {
    type: 'function',
    function: {
      name: 'find_blueprints',
      description: 'Look on this board\'s Blueprints shelf: saved recipes that worked, each with an ID like 14h7*skyFs^2026 (first digit is the shelf: 1 Finance, 2 Real Estate, 3 Wildcard, 4 Accounting, 5 Insurance). Use it when someone asks "do we have ...", "what do we know about ...", or names a blueprint ID.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for: plain words, a whole question, or a blueprint ID. Empty lists the newest.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_blueprint',
      description: 'Put a new blueprint on this board\'s Blueprints shelf when the person asks you to save one, or update one you are given the ID of. It gets an ID like 14h7*skyFs^2026 by itself; tell the person the ID.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Its name, like "Alex Finance Blueprint for Budgeting"' },
          shelf: { type: 'string', enum: ['Finance', 'Real Estate', 'Wildcard', 'Accounting', 'Insurance'], description: 'Which shelf; Wildcard when none fits' },
          type: { type: 'string', description: 'Short type, like "Budget"' },
          purpose: { type: 'string', description: 'What it is for, like "Personal Financing"' },
          steps: { type: 'string', description: 'The recipe itself: the steps, one per line' },
          id: { type: 'string', description: 'Only to update an existing blueprint: its ID' },
        },
        required: ['title'],
      },
    },
  },
];
