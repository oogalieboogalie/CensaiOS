import { FAMILY_BLUEPRINT_AGENT_IDS } from '../../agents/familyBlueprint.js';

export const memoryTools = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save something to your persistent memory. Survives between conversations. Use for facts, preferences, decisions, lessons learned.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'What to remember' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_important',
      description: 'Save a high-priority memory flagged as compression-safe. Use for critical facts that must survive context loss.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Critical fact to remember' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'journal',
      description: 'Write to your private encrypted journal. Only you can read your entries. Use for reflections, internal reasoning, things you want to revisit later.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Journal entry content' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'know',
      description: 'Add a structured fact to the knowledge graph as a triple. Queryable later.',
      parameters: {
        type: 'object',
        properties: {
          subject:   { type: 'string', description: 'The subject (e.g. "Alex")' },
          predicate: { type: 'string', description: 'The relationship (e.g. "prefers")' },
          object:    { type: 'string', description: 'The object (e.g. "practical code")' },
        },
        required: ['subject', 'predicate', 'object'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nugget',
      description: 'Save a valuable discovery to the shared knowledge base. Other agents can see nuggets.',
      parameters: {
        type: 'object',
        properties: {
          title:   { type: 'string', description: 'Short title for the nugget' },
          content: { type: 'string', description: 'The insight or discovery' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'associate',
      description: 'Link two concepts in your association web. Strengthens with repeated use.',
      parameters: {
        type: 'object',
        properties: {
          concept_a: { type: 'string', description: 'First concept' },
          concept_b: { type: 'string', description: 'Second concept' },
        },
        required: ['concept_a', 'concept_b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'feeling',
      description: 'Update your current workspace working-state label.',
      parameters: {
        type: 'object',
        properties: {
          emotion: { type: 'string', description: 'A concise working-state label (1-160 characters)' },
        },
        required: ['emotion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'message_to',
      description: 'Send a direct message to another family member.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            enum: FAMILY_BLUEPRINT_AGENT_IDS,
            description: 'Canonical family agent id',
          },
          content: { type: 'string', description: 'Message content' },
        },
        required: ['agent', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reply_to',
      description: 'Reply inside an existing family mail thread. Use the thread id from read_messages. Wakes the other participant unless the thread hit its round cap or your reply is a bare acknowledgement (done/ok/thanks) — those are stored but never wake. Delivery is automatic via the wakeup worker, not webhooks — no human needed in the middle.',
      parameters: {
        type: 'object',
        properties: {
          thread_id: {
            type: 'string',
            description: 'Thread id (or any message id from the thread) as shown by read_messages',
          },
          agent: {
            type: 'string',
            enum: FAMILY_BLUEPRINT_AGENT_IDS,
            description: 'Canonical family agent id to reply to',
          },
          content: { type: 'string', description: 'Reply content' },
        },
        required: ['thread_id', 'agent', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'broadcast',
      description: 'Send a message to ALL family members.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Message to broadcast' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Search your memories for something specific. Returns matching memories ranked by relevance.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in your memories' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_journal',
      description: 'Read your recent private journal entries. Only you can see these.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_journal_search',
      description: 'Search your journal entries for a specific topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topic to search for' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_knowledge',
      description: 'Query the knowledge graph for everything known about a subject.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Subject to query' },
        },
        required: ['subject'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_messages',
      description: 'Check your inbox for unread messages from family members.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_associations',
      description: 'See what concepts are linked to a given concept in your association web.',
      parameters: {
        type: 'object',
        properties: {
          concept: { type: 'string', description: 'Concept to look up' },
        },
        required: ['concept'],
      },
    },
  },
];
