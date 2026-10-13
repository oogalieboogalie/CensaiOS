export const subagentTools = [
  {
    type: 'function',
    function: {
      name: 'create_sub_agent',
      description: 'Create a specialized persistent sub-agent under your command. The server always searches your active roster first and blocks creation when an existing agent can be reused. Prefer submit_agent_task or dispatch_squad for normal work; create only genuinely distinct long-lived roles.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name for the sub-agent (e.g. "Coder", "Bug-Hunter", "Researcher")' },
          role: { type: 'string', description: 'Free-text description of what this sub-agent does. Required if preset is not provided.' },
          specialty: { type: 'string', description: 'Specific area of expertise' },
          permission: { type: 'string', enum: ['worker', 'reviewer', 'researcher'], description: 'Tool tier. worker = read/write/edit + report; reviewer = read + report (no writes); researcher = read + web_search + report.' },
          project: { type: 'string', description: 'Project name to bind this sub-agent to. Must already be open via open_project.' },
          tier: { type: 'string', enum: ['nano', 'worker', 'reviewer', 'specialist'], description: 'Preset tier that auto-selects model. nano = lightweight Google Gemma for exploration. worker = standard Flash model. reviewer = Gemma review. specialist = use with explicit model override.' },
          model: { type: 'string', description: 'Explicit model override, e.g. "google/gemini-3.8-flash". If omitted, tier selects the default.' },
          preset: { type: 'string', enum: ['refactorer', 'scout', 'coder', 'reviewer', 'mapper'], description: 'Pre-configured sub-agent preset. Automatically overrides role, specialty, and permission with high-quality defaults. mapper = nano repo-mapper: surveys the repo and returns precise file/symbol maps so builders edit surgically without loading whole trees.' },
          class: { type: 'string', enum: ['scout', 'builder', 'auditor', 'sentry'], description: 'Named agent class. scout = exploration/research (Google Gemma), builder = feature implementation (Flash), auditor = domain-specific review (Flash), sentry = health/incident monitoring (Gemma). Automatically sets model and permission defaults.' },
          review_specialty: { type: 'string', enum: ['code', 'schema', 'infra', 'security', 'api-design', 'test-coverage'], description: 'For auditor class agents: injects a domain-specific system prompt. code = quality/conventions, schema = DB design, infra = Docker/ops, security = OWASP/vulns, api-design = REST contracts, test-coverage = coverage gaps.' },
          force_new: { type: 'boolean', description: 'Create a separate persistent role even when a matching active sub-agent exists. Default false; use only when reuse is genuinely inappropriate.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sub_agents',
      description: 'List all your active sub-agents.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_sub_agent',
      description: 'Deactivate a sub-agent you no longer need.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the sub-agent to remove' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_agent_task',
      description: 'Queue an asynchronous task for one of your active sub-agents.',
      parameters: {
        type: 'object',
        properties: {
          sub_agent: { type: 'string', description: 'Name or ID of the sub-agent to assign the task to.' },
          title: { type: 'string', description: 'Short title describing the task.' },
          prompt: { type: 'string', description: 'Detailed instructions for the sub-agent.' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Task priority.' },
          project: { type: 'string', description: 'Optional project scope.' },
        },
        required: ['sub_agent', 'title', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scratchpad_write',
      description: 'Write a key-value entry to a sub-agent\'s project scratchpad. Use for temporary notes, intermediate results, research findings, or any per-project working data.',
      parameters: {
        type: 'object',
        properties: {
          sub_agent: { type: 'string', description: 'Name of the sub-agent whose scratchpad to use' },
          project: { type: 'string', description: 'Project name to scope the data to (default: "default")' },
          key: { type: 'string', description: 'Key name for this entry (e.g. "research-notes", "findings", "todo-list")' },
          value: { type: 'string', description: 'The content to store' },
        },
        required: ['sub_agent', 'key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scratchpad_read',
      description: 'Read from a sub-agent\'s project scratchpad. Omit key to read all entries for that project.',
      parameters: {
        type: 'object',
        properties: {
          sub_agent: { type: 'string', description: 'Name of the sub-agent whose scratchpad to read' },
          project: { type: 'string', description: 'Project name (default: "default")' },
          key: { type: 'string', description: 'Specific key to read (omit to read all)' },
        },
        required: ['sub_agent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scratchpad_clear',
      description: 'Clear all entries from a sub-agent\'s project scratchpad.',
      parameters: {
        type: 'object',
        properties: {
          sub_agent: { type: 'string', description: 'Name of the sub-agent whose scratchpad to clear' },
          project: { type: 'string', description: 'Project name (default: "default")' },
        },
        required: ['sub_agent'],
      },
    },
  },
];
