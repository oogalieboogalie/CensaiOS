export const devProjectTools = [
  {
    meta: { scope: 'system', destructive: false, requires_approval_above: 'researcher', audit_log: true },
    type: 'function',
    function: {
      name: 'http_test',
      description: 'Make an HTTP request to an endpoint and validate the response. Returns status code, latency, headers, and body snippet. Use to test API routes without leaving the agent context.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL to request' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET', description: 'HTTP method (default: GET)' },
          headers: { type: 'object', description: 'Optional request headers as key-value pairs' },
          body: { type: 'string', description: 'Optional request body (JSON string)' },
          expected_status: { type: 'integer', description: 'Expected HTTP status code — response is flagged if it differs' },
          timeout_ms: { type: 'integer', default: 5000, description: 'Request timeout in milliseconds (default: 5000)' },
        },
        required: ['url'],
      },
    },
  },
  {
    meta: { scope: 'project', destructive: false, requires_approval_above: 'worker', audit_log: true },
    type: 'function',
    function: {
      name: 'project_multi_edit',
      description: 'Make coordinated string replacements across multiple files in a project in a single call. Use for refactors that touch N files. Each edit specifies a path, the exact old_string to replace, and the new_string. Fails fast if any old_string is not found.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          edits: {
            type: 'array',
            description: 'Array of edits to apply',
            items: {
              type: 'object',
              properties: {
                path:       { type: 'string', description: 'Relative file path inside the project' },
                old_string: { type: 'string', description: 'Exact string to replace (must appear exactly once)' },
                new_string: { type: 'string', description: 'Replacement string' },
              },
              required: ['path', 'old_string', 'new_string'],
            },
          },
        },
        required: ['edits'],
      },
    },
  },
  {
    meta: { scope: 'project', destructive: false, requires_approval_above: 'researcher', audit_log: true },
    type: 'function',
    function: {
      name: 'analyze_deps',
      description: 'Analyze project dependencies. Modes: imports (list all deps + installed versions), circular (detect circular import cycles in src/ and server/), outdated (compare installed vs latest npm versions), all (run all three). Defaults to all.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['imports', 'circular', 'outdated', 'all'], default: 'all', description: 'Analysis mode (default: all)' },
          project_path: { type: 'string', description: 'Optional absolute/relative project root path, or an open project name such as "CensaiHub"' },
          project: { type: 'string', description: 'Optional open project name such as "CensaiHub"; preferred when referring to a shared project' },
        },
      },
    },
  },
];
