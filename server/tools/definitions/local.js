export const localTools = [
  {
    type: 'function',
    function: {
      name: 'local_list_dir',
      description: 'List the contents of a local directory on the host machine. Paths can be relative (resolved against the Homebase project root) or absolute. Prefer relative paths like "src/components" or "." to avoid guessing the absolute root.',
      parameters: {
        type: 'object',
        properties: {
          dir_path: { type: 'string', description: 'Relative path (e.g. "src/components") or absolute path. Relative paths resolve against the Homebase server cwd.' },
        },
        required: ['dir_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_read_file',
      description: 'Read the contents of a local file on the host machine. Paths can be relative (resolved against the Homebase project root) or absolute. Prefer relative paths like "server.js" or "src/app.jsx".',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative path (e.g. "server.js") or absolute path. Relative paths resolve against the Homebase server cwd.' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'local_write_file',
      description: 'Create or update a local file on the host machine. Paths can be relative (resolved against the Homebase project root) or absolute. CAUTION: This writes directly to the user\'s local disk.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative path (e.g. "src/components/Foo.jsx") or absolute path. Relative paths resolve against the Homebase server cwd.' },
          content: { type: 'string', description: 'The new contents of the file' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information using Tavily. Use this when you need up-to-date facts, news, documentation, or anything you don\'t already know. Returns relevant results with snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          search_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'Search depth — "basic" is fast, "advanced" is more thorough (default: basic)' },
          max_results: { type: 'integer', description: 'Maximum number of results to return (default: 5, max: 10)' },
          include_domains: { type: 'array', items: { type: 'string' }, description: 'Only search these domains — e.g. ["facebook.com", "instagram.com", "linkedin.com"] for social hunting' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_extract',
      description: 'Extract clean page content (contact info, team rosters, bios) from up to 5 URLs using Tavily. Use after web_search to pull names, phones, emails, and socials off promising pages. Each URL costs one Tavily action — batch only pages that matter.',
      parameters: {
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' }, description: 'Page URLs to extract (max 5)' },
          query: { type: 'string', description: 'Focus the extraction (e.g. "team member names phones emails social profiles")' },
        },
        required: ['urls'],
      },
    },
  },
];
