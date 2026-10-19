export const TOOL_DISCOVERY_NAMES = ['search_tools', 'get_tool', 'get_toolkit'];
// Loaded from the start even when an agent searches for the rest: Censai's
// hand-off tools are how he hands out work (server/censaiOrchestrator).
export const ALWAYS_LOADED_TOOL_NAMES = ['hand_off_jobs', 'jobs_status', 'stop_jobs'];

export const discoveryTools = [
  {
    type: 'function',
    function: {
      name: 'search_tools',
      description: 'Discover tools you are allowed to use by capability, task, type, tag, or tool kit. Use this when you need a tool but do not know its exact name. It searches by meaning too: "send a message" also finds mail and agent-message tools.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you need to do, such as "write a project file" or "restart a container".' },
          kit: { type: 'string', description: 'Optional exact kit name, such as "Coding Operations" or "Server Maintenance".' },
          type: { type: 'string', description: 'Optional exact tool type, such as "fileOps" or "serverOps".' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tool',
      description: 'Get the full schema and metadata for one tool you are allowed to use.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact tool name returned by search_tools.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_toolkit',
      description: 'Load a whole tool kit at once, such as "Coding Operations" or "Server Maintenance". Returns every tool in that kit you are allowed to use; they are all ready on your next step. Use it when a job needs several tools from the same kit.',
      parameters: {
        type: 'object',
        properties: {
          kit: { type: 'string', description: 'Kit name as search_tools shows it, such as "Coding Operations".' },
        },
        required: ['kit'],
      },
    },
  },
];
