// ─── Mailcow Tool Definitions ────────────────────────────────────────────────
// 8 OpenAI-compatible function-calling definitions for mailcow-dockerized.
// Foundation gets all 8; Atlas gets read-only by default (enforced in
// definitions.js CORE_AGENT_TOOL_WHITELIST).

export const mailcowTools = [
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: false,
    },
    type: 'function',
    function: {
      name: 'mailcow_domains',
      description:
        'List all domains configured on the mailcow mail server. Returns domain name, active status, mailbox count, quota, and relay settings.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: false,
    },
    type: 'function',
    function: {
      name: 'mailcow_mailboxes',
      description:
        'List all mailboxes on the mailcow server, optionally filtered to a specific domain. Returns address, display name, quota used/total, and active status.',
      parameters: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: 'Optional domain filter (e.g. "yourdomain.com"). Omit to list all mailboxes.',
          },
        },
      },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: false,
    },
    type: 'function',
    function: {
      name: 'mailcow_aliases',
      description:
        'List all email aliases configured on the mailcow server. Returns alias address, goto target, domain, and active status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: false,
    },
    type: 'function',
    function: {
      name: 'mailcow_queue',
      description:
        'Check the mailcow mail queue. Returns queued message count and details of any stuck or deferred messages.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'worker',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'mailcow_add_mailbox',
      description:
        'Create a new mailbox on the mailcow server. Quota is in MB (e.g. 2048 = 2GB). Set active to 1 to enable immediately.',
      parameters: {
        type: 'object',
        properties: {
          local_part: {
            type: 'string',
            description: 'The part before the @ (e.g. "alex" for alex@yourdomain.com)',
          },
          domain: {
            type: 'string',
            description: 'The domain (e.g. "yourdomain.com")',
          },
          name: {
            type: 'string',
            description: 'Display name for the mailbox (e.g. "Alex Johnson")',
          },
          password: {
            type: 'string',
            description: 'Password for the mailbox',
          },
          quota: {
            type: 'integer',
            description: 'Quota in MB (e.g. 2048 for 2GB). Use 0 for unlimited.',
            default: 2048,
          },
          active: {
            type: 'integer',
            description: '1 to make active immediately, 0 to create disabled',
            default: 1,
          },
        },
        required: ['local_part', 'domain', 'name', 'password'],
      },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: true,
      requires_approval_above: 'reviewer',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'mailcow_delete_mailbox',
      description:
        'Delete a mailbox from the mailcow server. This is permanent — all stored email for the address will be lost.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Full email address to delete (e.g. "alex@yourdomain.com")',
          },
        },
        required: ['address'],
      },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: false,
      requires_approval_above: 'worker',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'mailcow_add_alias',
      description:
        'Create an email alias that forwards to a destination address (goto). Useful for role addresses like info@, support@, contact@.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'The alias address (e.g. "info@yourdomain.com")',
          },
          goto: {
            type: 'string',
            description: 'Destination address to forward to (e.g. "alex@yourdomain.com")',
          },
          active: {
            type: 'integer',
            description: '1 to activate immediately (default)',
            default: 1,
          },
        },
        required: ['address', 'goto'],
      },
    },
  },
  {
    meta: {
      scope: 'mail',
      destructive: true,
      requires_approval_above: 'reviewer',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'mailcow_delete_alias',
      description: 'Delete an email alias by its ID. Use mailcow_aliases to find the alias ID.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'Alias ID from mailcow (returned by mailcow_aliases)',
          },
        },
        required: ['id'],
      },
    },
  },
];
