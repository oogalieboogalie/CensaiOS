export const coreProjectTools = [
  {
    type: 'function',
    function: {
      name: 'open_project',
      description: 'Open or create a project you own. Default mode is GitHub: pass `repo` ("owner/repo") and the project will be backed by that repo. The brief (directory tree + entry points + summary) is kept in the app: opening only reads the repo and never writes to it. Sub-agents bound to this project will work via GitHub (their own branches, PRs, issues). Local-folder mode is also supported via existing_path for the eventual Tauri build.',
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
      description: 'Read the briefing for a project — directory tree, entry points, recent activity. Sub-agents: if omitted, reads your bound project.',
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
      description: 'Regenerate the PROJECT.md briefing after meaningful changes (e.g. new files, new entry points). For a project in a folder it rewrites .team/PROJECT.md there. For a project kept on GitHub it only reads the repo and keeps the briefing in the app: nothing is written to the repo.',
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
      description: 'Read a file inside a project, by path relative to the project root. Sub-agents: omit `project` to use your bound project. A path starting past:// (for example past://homebase-db/FAMILY_CORE/...) reads the family\'s past, a read-only copy of the old homebase-db folder, whatever `project` says.',
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
      description: 'Create or overwrite a file inside a project. Use project_edit for surgical changes to existing files. Reviewer and researcher sub-agents cannot call this. In a project kept on GitHub the change goes only on your own work branch, never on the main branch: a worker sub-agent\'s own branch, or the branch made for the coding job Censai handed you. The branch is made for you on your first change. With no coding job, or when GitHub will not make the branch, the call is refused, nothing is changed, and you should say so in your answer.',
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
      description: 'Surgical edit inside an existing project file: replace exactly one occurrence of old_string with new_string. Handles LF/CRLF line-ending differences, but old_string must still identify one unique block. For large files, use project_file_outline and targeted project_read chunks first; do not include partial-read headers in old_string. In a project kept on GitHub the edit goes only on your own work branch (a worker sub-agent\'s branch, or the branch of the coding job Censai handed you), never on the main branch; with no such branch it is refused and nothing is changed.',
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
      description: 'List entries in a directory inside a project. Defaults to the project root. A path starting past:// (start with past://homebase-db) lists the family\'s past, read only.',
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
      description: 'Open a pull request from your work branch back to the main branch of a project kept on GitHub. Use it when the work is finished and ready for review. Who can call it: a worker sub-agent, from its own branch; and a family agent, only from the branch made for a coding job Censai handed it, while it has that job. Reviewer and researcher sub-agents cannot, and neither can a family agent with no coding job. It needs a job branch: change a file first (project_write or project_edit), which makes the branch. Calling it again for the same branch gives back the pull request that is already open instead of opening a second one.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name (optional: defaults to your job\'s or your bound project)' },
          title: { type: 'string', description: 'PR title — a short summary of what changed' },
          body: { type: 'string', description: 'PR description — markdown explaining the change' },
        },
        required: ['title', 'body'],
      },
    },
  },
];
