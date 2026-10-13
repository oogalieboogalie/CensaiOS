// Preset agent toolkits (idea 2026-08-08).
// A toolkit is a named, curated tool list. Selecting one populates the
// designer's tool selection; users can then add/remove tools freely.
// Tool names must match server tool registry names (see CORE_AGENT_DEFAULT_TOOLS).
export const TOOLKITS = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced starter set for any agent.',
    tools: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_list', 'read_brief', 'report'],
  },
  {
    id: 'web-researcher',
    label: 'Web Researcher',
    description: 'Browser + search + read tools for research agents.',
    tools: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'web_search', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report'],
  },
  {
    id: 'code-assistant',
    label: 'Code Assistant',
    description: 'Read/write/edit plus tests and lint for coding agents.',
    tools: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'project_multi_edit', 'read_brief', 'refresh_brief', 'report', 'run_tests', 'run_linter'],
  },
  {
    id: 'data-analyst',
    label: 'Data Analyst',
    description: 'Sheets + search + read tools for data work.',
    tools: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'web_search', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report', 'sheets_read_range', 'sheets_append_row', 'sheets_update_cell'],
  },
  {
    id: 'repo-operator',
    label: 'Repo Operator',
    description: 'Containers + git + PR tools for ops agents.',
    tools: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report', 'container_status', 'container_logs', 'pr_status', 'pr_comments'],
  },
];

export function toolkitById(id) {
  return TOOLKITS.find(toolkit => toolkit.id === id) || null;
}

export function toolkitTools(id) {
  return [...(toolkitById(id)?.tools || [])];
}

// Pure helper so tests can pin the contract without React.
export function applyToolkit(_currentTools, toolkitId) {
  return toolkitTools(toolkitId);
}

// Broad local-filesystem scopes need an explicit user warning (idea 2026-08-08:
// C:\* grants the whole drive). Matches Windows drive roots and UNC roots.
export function isBroadLocalScope(paths) {
  const list = Array.isArray(paths) ? paths : String(paths || '').split(/[\n,]+/);
  return list
    .map(entry => String(entry || '').trim().replace(/\//g, '\\'))
    .some(entry => /^[A-Za-z]:\\\*?$/.test(entry) || /^\\\\\*?$/.test(entry) || entry === '*');
}
