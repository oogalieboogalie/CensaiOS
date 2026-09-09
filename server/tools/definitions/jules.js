export const julesTools = [
  {
    type: 'function',
    function: {
      name: 'jules_submit',
      description: 'Hand off a precise coding task to Jules, Google\'s autonomous coding agent. Jules works asynchronously on the specified branch and (in AUTO_CREATE_PR mode) opens a pull request when it finishes. Use this for substantial code changes — Jules is rigid, so the prompt must be SPECIFIC: name the files to change, the behavior to implement, edge cases to handle, and the test or verification step. Sub-agents: omit `branch` to use your own branch. Returns a Jules session you can poll with jules_status.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Precise task description for Jules. Include: target files, exact behavior change, acceptance criteria. Vague prompts produce vague PRs.' },
          project: { type: 'string', description: 'Project name (head agents). Sub-agents can omit.' },
          branch: { type: 'string', description: 'Branch Jules should start from. Sub-agents: omit to use your bound branch.' },
          title: { type: 'string', description: 'Short title for the Jules session (defaults to first 80 chars of prompt)' },
          require_plan_approval: { type: 'boolean', description: 'If true, Jules will plan first and wait for approval before executing. Use for risky or far-reaching changes. Default false.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jules_status',
      description: 'Check the status of a Jules session. Polls Jules, updates the DB, and returns current state + PR link if one has been opened.',
      parameters: {
        type: 'object',
        properties: {
          session: { type: 'string', description: 'Jules session name (e.g. "sessions/abc123") or short id' },
        },
        required: ['session'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jules_list',
      description: 'List Jules sessions for a project. By default shows only active sessions (queued, planning, in progress).',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          include_completed: { type: 'boolean', description: 'Include completed and failed sessions (default false)' },
        },
      },
    },
  },
];
