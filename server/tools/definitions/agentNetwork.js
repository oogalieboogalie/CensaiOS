export const agentNetworkTools = [
  {
    type: 'function',
    function: {
      name: 'discover_agents',
      description: 'Find other agents in the registry that can help with a need, ranked by the skills they advertise. Returns each agent\'s card_id, matched skills, whether it is callable, and whether you may request it (built-in family agents and agents pinned in this workspace).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you need help with, in plain words (e.g. "write a postgres migration")' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional skill tags every result must carry (e.g. ["database"])' },
          limit: { type: 'number', description: 'Max results, 1-20 (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_agent_help',
      description: 'Ask another agent (found with discover_agents) to do a task for you. The request runs on that agent and you get its answer back. Set wait_seconds to wait for the answer in this call; otherwise check later with agent_help_status.',
      parameters: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'Exact card_id from discover_agents (e.g. "agent:nexus")' },
          task: { type: 'string', description: 'The self-contained task for the helper, with all context it needs (max 8000 chars)' },
          skill_id: { type: 'string', description: 'Optional id of the advertised skill you are asking for' },
          wait_seconds: { type: 'number', description: 'Optional: wait up to this many seconds (max 45) for the answer' },
        },
        required: ['card_id', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_help_status',
      description: 'Check a help request you made with request_agent_help: queued, working, completed (with the helper\'s answer), failed, pending (waiting for the agent owner) or declined.',
      parameters: {
        type: 'object',
        properties: {
          request_id: { type: 'string', description: 'The request_id returned by request_agent_help' },
        },
        required: ['request_id'],
      },
    },
  },
];
