export const coreProjectTools = [
  {
    type: 'function',
    function: {
      name: 'open_project',
      description: 'Open or create a project you own. Default mode is GitHub: pass `repo` ("owner/repo") and the project will be backed by that repo. The brief (directory tree + entry points + summary) is committed to .team/PROJECT.md on the default branch. Sub-agents bound to this project will work via GitHub (their own branches, PRs, issues). Local-folder mode is also supported via existing_path for the eventual Tauri build.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'GitHub repo in owner/repo format. Primary mode — use this.' },
          name: { type: 'string', description: 'Project name. Defaults to the repo name if omitted.' },
          summary: { type: 'string', description: 'Short summary of what this project is' },
          existing_path: { type: 'string', description: 'Optional absolute local path (used only for local-mode projects, not GitHub).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'List all shared projects available to core agents.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_brief',
      description: 'Read the PROJECT.md briefing for a project — directory tree, entry points, recent activity. Sub-agents: if omitted, reads your bound project.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (head agents). Sub-agents can omit to use their bound project.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'refresh_brief',
      description: 'Regenerate the PROJECT.md briefing after meaningful changes (e.g. new files, new entry points).',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_read',
      description: 'Read a file inside a project, by path relative to the project root. Sub-agents: omit `project` to use your bound project.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          path: { type: 'string', description: 'Relative path inside the project (e.g. "server/index.js")' },
          offset: { type: 'number', description: 'Character offset for large files. Use the next offset shown in a partial read header.' },
          max_chars: { type: 'number', description: 'Maximum characters to return. Defaults to 20000; maximum is 60000.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_file_outline',
      description: 'Read a compact outline of a project file before editing large files. Shows imports, exports, functions, classes, route handlers, and switch cases with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          path: { type: 'string', description: 'Relative path inside the project (e.g. "src/components/Canvas.jsx")' },
          max_entries: { type: 'number', description: 'Maximum outline entries to return. Defaults to 200; maximum is 500.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_write',
      description: 'Create or overwrite a file inside a project. Use project_edit for surgical changes to existing files. Reviewer sub-agents cannot call this.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          path: { type: 'string', description: 'Relative path inside the project' },
          content: { type: 'string', description: 'Full new content of the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_edit',
      description: 'Surgical edit inside an existing project file: replace exactly one occurrence of old_string with new_string. Handles LF/CRLF line-ending differences, but old_string must still identify one unique block. For large files, use project_file_outline and targeted project_read chunks first; do not include partial-read headers in old_string.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          path: { type: 'string', description: 'Relative path inside the project' },
          old_string: { type: 'string', description: 'Text to replace (must appear exactly once)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_list',
      description: 'List entries in a directory inside a project. Defaults to the project root.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents)' },
          path: { type: 'string', description: 'Relative directory path (default ".")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'report',
      description: 'File a report for the project. For GitHub projects this opens a labelled "report" issue (visible in the GitHub UI). For local projects it drops a markdown file in .team/reports/. Reviewers use this for bug findings; workers use it for handoff notes.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional for sub-agents — defaults to bound project)' },
          title: { type: 'string', description: 'Short title (e.g. "Potential SQL injection in users route")' },
          content: { type: 'string', description: 'Full report body in markdown' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_pr',
      description: 'Open a pull request from your branch back to the project\'s default branch. Use this when you\'ve finished a unit of work and want a human to review/merge it. Only available to worker sub-agents bound to a GitHub project.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'PR title — a short summary of what changed' },
          body: { type: 'string', description: 'PR description — markdown explaining the change' },
        },
        required: ['title', 'body'],
      },
    },
  },
];
