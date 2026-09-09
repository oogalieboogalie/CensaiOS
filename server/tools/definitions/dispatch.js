export const dispatchTools = [
  {
    type: 'function',
    meta: { scope: 'agent', destructive: false, requires_approval_above: 'worker', audit_log: true },
    function: {
      name: 'dispatch_squad',
      description: 'Dispatch multiple sub-agents on parallel tasks simultaneously. Each task runs autonomously in the background. You will receive a message notification when all tasks complete. Use squad_status to check progress or read results.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'A short name for this dispatch batch (e.g. "auth-audit", "perf-sprint"). Used to identify the group in squad_status.' },
          tasks: {
            type: 'array',
            description: 'List of tasks to dispatch in parallel.',
            items: {
              type: 'object',
              properties: {
                assignee: { type: 'string', description: 'Name of the sub-agent to assign this task to (e.g. "Scout-1", "Builder-Alpha").' },
                title: { type: 'string', description: 'Short task title.' },
                prompt: { type: 'string', description: 'Full task instructions for the sub-agent. Be specific — the sub-agent runs autonomously with no follow-up.' },
                priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'], description: 'Task priority (default: normal).' },
              },
              required: ['assignee', 'title', 'prompt'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    meta: { scope: 'agent', destructive: false, requires_approval_above: 'researcher', audit_log: false },
    function: {
      name: 'squad_status',
      description: 'Check the status and results of a squad dispatch. Shows each task — status (queued/in_progress/completed/failed), agent, duration, and result snippet.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'The batch label used in dispatch_squad.' },
        },
        required: ['label'],
      },
    },
  },
  {
    type: 'function',
    meta: { scope: 'agent', destructive: false, requires_approval_above: null, audit_log: true },
    function: {
      name: 'task_done',
      description: 'Signal that you have completed your assigned task. Call this when you have finished your work and want to notify your parent agent. Include a summary of what you did or found.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of what you completed, found, or produced.' },
        },
        required: ['summary'],
      },
    },
  },
];
