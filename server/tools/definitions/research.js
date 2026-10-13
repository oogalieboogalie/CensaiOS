export const researchTools = [
  {
    type: 'function',
    function: {
      name: 'lead_save',
      description: 'Save a scouted sales lead (realtor team/member) to the workspace lead store. Dedupes on email/phone. Include buying signals (hiring, new team, open houses) and social profiles when found. Costs nothing — this is local storage, not Tavily.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Contact or team name (required)' },
          team: { type: 'string', description: 'Team name' },
          brokerage: { type: 'string', description: 'Brokerage' },
          city: { type: 'string', description: 'City/market' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email address' },
          website: { type: 'string', description: 'Website URL' },
          facebook: { type: 'string', description: 'Facebook profile/page URL' },
          instagram: { type: 'string', description: 'Instagram profile URL' },
          linkedin: { type: 'string', description: 'LinkedIn profile URL' },
          buying_signals: { type: 'array', items: { type: 'string' }, description: 'Observed buying signals, e.g. ["hiring", "new team", "weekly open houses"]' },
          icp_score: { type: 'number', description: 'Fit score 0-1 against the ideal customer profile' },
          source_url: { type: 'string', description: 'Page the lead was found on' },
          notes: { type: 'string', description: 'Scout notes' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lead_list',
      description: 'List saved sales leads ordered by ICP score. Filter by status or minimum score.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status (new, contacted, qualified, dead)' },
          min_score: { type: 'number', description: 'Minimum ICP score 0-1' },
          limit: { type: 'integer', description: 'Max leads to return (default 50, max 200)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lead_status',
      description: 'Move a lead through the pipeline (new → contacted → qualified → dead).',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'Lead id from lead_list' },
          status: { type: 'string', description: 'New status' },
        },
        required: ['lead_id', 'status'],
      },
    },
  },
];
