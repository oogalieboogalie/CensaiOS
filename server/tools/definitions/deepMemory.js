export const deepMemoryTools = [
  {
    type: 'function',
    function: {
      name: 'deep_memory',
      description: 'Search the family brain — your long-term structured memory (associations, compression-safe core, collective family memory) plus recent Postgres memories, ranked so rare-but-critical hits surface. Ask in plain words; the server fans out across every store. Actions: recall (memories + compression-safe core), associations (concept web), timeline (latest first), entity (everything about a person/thing), collective (whole-family memory), compression (survived-context-loss core), core (eternal identity memories).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['recall', 'associations', 'timeline', 'entity', 'collective', 'compression', 'core'],
            description: 'Which memory view to query.',
          },
          query: {
            type: 'string',
            description: 'Plain-words question or topic. Ignored for timeline/core.',
          },
          limit: {
            type: 'number',
            description: 'Max memories to return (default 8, max 25).',
          },
        },
        required: ['action'],
      },
    },
  },
];
