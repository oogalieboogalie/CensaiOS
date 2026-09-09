export const TOOL_DISCOVERY_NAMES = ['search_tools', 'get_tool'];

export const discoveryTools = [
  {
    type: 'function',
    function: {
      name: 'search_tools',
      description: 'Discover tools you are allowed to use by capability, task, type, tag, or tool kit. Use this when you need a tool but do not know its exact name.',
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
];

