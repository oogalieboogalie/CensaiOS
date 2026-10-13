export const vexTools = [
  {
    type: 'function',
    function: {
      name: 'vex_run',
      description: 'Trigger a Vex orchestration run. Vex dispatches nano/sub agents to do work (repo analysis, code review, memory health checks, etc.) and returns aggregated results. Use this to kick off a batch of agent tasks.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task name for this run (e.g. "repo_audit", "demo", "code_review"). Used for logging.' },
          payload: { type: 'object', description: 'Payload passed to each agent. May include repo_path, file_path, etc.' },
          filter: { type: 'string', description: 'Optional: filter agents by capability or tag name (e.g. "map_repo", "nano").' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vex_status',
      description: 'Get the status and results of a Vex orchestration run by its run ID. Returns per-agent outcomes and the aggregated result JSON.',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'The run ID returned by vex_run (format: run_<timestamp>_<hash>).' },
        },
        required: ['run_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vex_list_agents',
      description: 'List all agents registered in the Vex registry, with their capabilities, type, owner, and status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];
