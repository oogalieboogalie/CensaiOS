export const containerTools = [
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'container_status',
      description: 'Check the status of all Docker Compose services in the Homebase stack. Returns service name, running state, health, and exposed ports.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'container_logs',
      description: 'Fetch recent logs from a Docker Compose service. Defaults to the homebase app service.',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            default: 'homebase',
            description: 'Service name to fetch logs from (default: homebase)',
          },
          lines: {
            type: 'integer',
            default: 50,
            description: 'Number of log lines to return (default: 50)',
          },
        },
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: true,
      requires_approval_above: 'reviewer',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'restart_service',
      description: 'Restart a Docker Compose service. Use with caution — this will briefly interrupt traffic. Defaults to homebase service.',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            default: 'homebase',
            description: 'Service name to restart (default: homebase)',
          },
        },
      },
    },
  },
];
