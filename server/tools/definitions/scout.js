// Scout agents: every core agent has a fast, cheap scout that keeps a map of
// a project's code and points to the exact file and line for a change. The
// scout is the eyes and ears; the core agent makes the edit itself.

export const scoutTools = [
  {
    type: 'function',
    function: {
      name: 'scout_map',
      description: 'Ask your scout for its map of a project\'s code, kept fresh as files change. Without a path: the size of the repo, its most used files and biggest folders. With a path: what that file defines (with line numbers), what it uses, which files use it (they may need to change too) and its tests. Costs no model call.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (from list_projects). Optional when you have one project.' },
          path: { type: 'string', description: 'A file in the project, e.g. "server/routes/chat/main.js". A unique file name also works.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scout_find',
      description: 'Send your scout to find exactly where a change should go before you edit. Describe the change in plain words; the scout searches its map and its small, fast model picks the file, line and column, says why, and lists the files that use that file and the tests to run. It never edits: you make the change yourself with project_edit.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (from list_projects). Optional when you have one project.' },
          change: { type: 'string', description: 'The change, in plain words, e.g. "make the welcome screen button say Start".' },
        },
        required: ['change'],
      },
    },
  },
];
