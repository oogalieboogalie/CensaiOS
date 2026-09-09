export const policyTools = [
  {
    type: 'function',
    function: {
      name: 'policy_evaluate',
      description: 'Evaluate an action against the Unified Policy Framework (DevSecOps 2026).',
      parameters: {
        type: 'object',
        properties: {
          action_type: { type: 'string', description: 'The type of action (e.g., filesystem_write, cloud_provision)' },
          input_data: { type: 'object', description: 'Contextual data for policy evaluation (e.g., { path: "/etc/passwd" })' }
        },
        required: ['action_type', 'input_data']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'policy_record_evidence',
      description: 'Manually record evidence for an automated or AI-assisted action.',
      parameters: {
        type: 'object',
        properties: {
          action_type: { type: 'string', description: 'The type of action recorded' },
          resource_id: { type: 'string', description: 'Identifier of the affected resource' },
          decision: { type: 'string', enum: ['allow', 'deny', 'manual_approval_required'] },
          reason: { type: 'string', description: 'Context or reason for the decision' },
          input_data: { type: 'object', description: 'The original input data' }
        },
        required: ['action_type', 'decision', 'input_data']
      }
    }
  }
];
