import { TOOL_DEFINITIONS } from './definitions.js';
import { metadataForTool } from './toolMetadata.js';

export const TOOL_CATALOG_OVERRIDES = {
  web_search: { label: 'Tavily Search', category: 'Research', provider: 'Tavily', scopeKind: 'web' },
  web_extract: { label: 'Tavily Extract', category: 'Research', provider: 'Tavily', scopeKind: 'web' },
  lead_save: { label: 'Save Lead', category: 'Research', scopeKind: 'workspace' },
  lead_list: { label: 'List Leads', category: 'Research', scopeKind: 'workspace' },
  lead_status: { label: 'Set Lead Status', category: 'Research', scopeKind: 'workspace' },
  github_read_file: { label: 'GitHub Read File', category: 'GitHub', scopeKind: 'github_repo' },
  github_write_file: { label: 'GitHub Write File', category: 'GitHub', scopeKind: 'github_repo', risk: 'write' },
  github_list_issues: { label: 'GitHub List Issues', category: 'GitHub', scopeKind: 'github_repo' },
  github_create_issue: { label: 'GitHub Create Issue', category: 'GitHub', scopeKind: 'github_repo', risk: 'write' },
  github_comment_issue: { label: 'GitHub Comment Issue', category: 'GitHub', scopeKind: 'github_repo', risk: 'write' },
  project_list: { label: 'Project List', category: 'Project', scopeKind: 'project' },  project_read: { label: 'Project Read', category: 'Project', scopeKind: 'project' },
  project_file_outline: { label: 'Project File Outline', category: 'Project', scopeKind: 'project' },
  project_write: { label: 'Project Write', category: 'Project', scopeKind: 'project', risk: 'write' },
  project_edit: { label: 'Project Edit', category: 'Project', scopeKind: 'project', risk: 'write' },
  project_multi_edit: { label: 'Project Multi Edit', category: 'Project', scopeKind: 'project', risk: 'write' },
  read_brief: { label: 'Read Project Brief', category: 'Project', scopeKind: 'project' },
  refresh_brief: { label: 'Refresh Project Brief', category: 'Project', scopeKind: 'project', risk: 'write' },
  submit_pr: { label: 'Submit Pull Request', category: 'GitHub', scopeKind: 'github_repo', risk: 'write' },
  pr_status: { label: 'Pull Request Status', category: 'GitHub', scopeKind: 'github_repo' },
  pr_comments: { label: 'Pull Request Comments', category: 'GitHub', scopeKind: 'github_repo' },
  merge_pr: { label: 'Merge Pull Request', category: 'GitHub', scopeKind: 'github_repo', risk: 'admin' },
  local_git_status: { label: 'Local Git Status', category: 'Local Git', scopeKind: 'project' },
  local_git_fetch: { label: 'Local Git Fetch', category: 'Local Git', scopeKind: 'project' },
  local_git_pull_ff_only: { label: 'Local Git Pull Fast-Forward', category: 'Local Git', scopeKind: 'project', risk: 'write' },
  local_git_checkpoint: { label: 'Local Git Checkpoint', category: 'Local Git', scopeKind: 'project', risk: 'write' },
  local_git_verify: { label: 'Local Git Verify', category: 'Local Git', scopeKind: 'project' },
  local_list_dir: { label: 'Local List Directory', category: 'Local Files', scopeKind: 'filesystem' },
  local_read_file: { label: 'Local Read File', category: 'Local Files', scopeKind: 'filesystem' },
  local_write_file: { label: 'Local Write File', category: 'Local Files', scopeKind: 'filesystem', risk: 'write' },
  local_file_outline: { label: 'Local File Outline', category: 'Local Files', scopeKind: 'filesystem' },
  run_tests: { label: 'Run Tests', category: 'Runtime', scopeKind: 'project' },
  run_linter: { label: 'Run Linter', category: 'Runtime', scopeKind: 'project' },
  sandbox_exec: { label: 'Sandbox Shell', category: 'Runtime', scopeKind: 'project', risk: 'write' },
  http_test: { label: 'HTTP Test', category: 'Runtime', scopeKind: 'network' },
  container_status: { label: 'Container Status', category: 'Ops', scopeKind: 'docker' },
  container_logs: { label: 'Container Logs', category: 'Ops', scopeKind: 'docker' },
  restart_service: { label: 'Restart Service', category: 'Ops', scopeKind: 'docker', risk: 'admin' },
  db_inspect: { label: 'Database Inspect', category: 'Database', scopeKind: 'database' },
  postgres_tool_info: { label: 'Postgres Tool Info', category: 'Database', scopeKind: 'database' },
  postgres_query: { label: 'Postgres Query', category: 'Database', scopeKind: 'database', risk: 'write' },
  postgres_exec_file: { label: 'Postgres Exec File', category: 'Database', scopeKind: 'database', risk: 'write' },
  postgres_schema_audit: { label: 'Postgres Schema Audit', category: 'Database', scopeKind: 'database' },
  postgres_table_sample: { label: 'Postgres Table Sample', category: 'Database', scopeKind: 'database' },
  analyze_deps: { label: 'Dependency Analysis', category: 'Runtime', scopeKind: 'project' },
  dispatch_squad: { label: 'Dispatch Squad', category: 'Coordination', scopeKind: 'agents' },
  squad_status: { label: 'Squad Status', category: 'Coordination', scopeKind: 'agents' },
  create_sub_agent: { label: 'Create Sub-Agent', category: 'Coordination', scopeKind: 'agents', risk: 'write' },
  list_sub_agents: { label: 'List Sub-Agents', category: 'Coordination', scopeKind: 'agents' },
  remove_sub_agent: { label: 'Remove Sub-Agent', category: 'Coordination', scopeKind: 'agents', risk: 'write' },
  submit_agent_task: { label: 'Submit Agent Task', category: 'Coordination', scopeKind: 'agents', risk: 'write' },
  scratchpad_write: { label: 'Scratchpad Write', category: 'Coordination', scopeKind: 'agents' },
  scratchpad_read: { label: 'Scratchpad Read', category: 'Coordination', scopeKind: 'agents' },
  scratchpad_clear: { label: 'Scratchpad Clear', category: 'Coordination', scopeKind: 'agents' },
  deep_memory: { label: 'Deep Memory', category: 'Memory', scopeKind: 'agents' },
  jules_submit: { label: 'Jules Submit', category: 'External Agents', scopeKind: 'project', risk: 'write' },
  jules_status: { label: 'Jules Status', category: 'External Agents', scopeKind: 'project' },
  jules_list: { label: 'Jules List', category: 'External Agents', scopeKind: 'project' },
  sheets_read_range: { label: 'Sheets Read Range', category: 'Google Workspace', scopeKind: 'workspace' },
  sheets_append_row: { label: 'Sheets Append Row', category: 'Google Workspace', scopeKind: 'workspace', risk: 'write' },
  sheets_update_cell: { label: 'Sheets Update Cell', category: 'Google Workspace', scopeKind: 'workspace', risk: 'write' },
  canvas_list_writable_windows: { label: 'Canvas Writable Windows', category: 'Coordination', scopeKind: 'workspace' },
  canvas_append_window: { label: 'Canvas Append Window', category: 'Coordination', scopeKind: 'workspace', risk: 'write' },
  canvas_spawn_window: { label: 'Canvas Spawn Window', category: 'Coordination', scopeKind: 'workspace', risk: 'write' },
  project_preview: { label: 'Project Preview', category: 'Coordination', scopeKind: 'workspace', risk: 'write' },
  canvas_window_index: { label: 'Canvas Window Index', category: 'Coordination', scopeKind: 'workspace' },  // Mailcow
  mailcow_domains:        { label: 'Mailcow Domains',        category: 'Mail', scopeKind: 'mail' },
  mailcow_mailboxes:      { label: 'Mailcow Mailboxes',      category: 'Mail', scopeKind: 'mail' },
  mailcow_aliases:        { label: 'Mailcow Aliases',        category: 'Mail', scopeKind: 'mail' },
  mailcow_queue:          { label: 'Mailcow Queue',          category: 'Mail', scopeKind: 'mail' },
  mailcow_add_mailbox:    { label: 'Mailcow Add Mailbox',    category: 'Mail', scopeKind: 'mail', risk: 'write' },
  mailcow_delete_mailbox: { label: 'Mailcow Delete Mailbox', category: 'Mail', scopeKind: 'mail', risk: 'admin' },
  mailcow_add_alias:      { label: 'Mailcow Add Alias',      category: 'Mail', scopeKind: 'mail', risk: 'write' },
  mailcow_delete_alias:   { label: 'Mailcow Delete Alias',   category: 'Mail', scopeKind: 'mail', risk: 'admin' },
};

function titleizeToolName(name) {
  return String(name || '')
    .split('_')
    .map(part => part ? part[0].toUpperCase() + part.slice(1) : '')
    .join(' ');
}

function categoryForTool(name) {
  if (name?.startsWith('github_') || name?.startsWith('pr_')) return 'GitHub';
  if (name?.startsWith('project_')) return 'Project';
  if (name?.startsWith('local_')) return 'Local Files';
  if (name?.startsWith('db_') || name?.startsWith('postgres_')) return 'Database';
  if (name?.startsWith('container_') || name === 'restart_service') return 'Ops';
  if (name?.startsWith('jules_')) return 'External Agents';
  if (name?.startsWith('sheets_')) return 'Google Workspace';
  if (name?.startsWith('mailcow_')) return 'Mail';
  if (['remember', 'recall', 'journal', 'read_journal', 'read_journal_search'].includes(name)) return 'Memory';
  if (['message_to', 'reply_to', 'read_messages', 'report', 'task_done'].includes(name)) return 'Coordination';
  if (['web_search', 'web_extract', 'lead_save', 'lead_list', 'lead_status'].includes(name)) return 'Research';
  return 'General';
}

export function listToolCatalog() {
  const tools = TOOL_DEFINITIONS.map(tool => {
    const name = tool.function.name;
    const override = TOOL_CATALOG_OVERRIDES[name] || {};
    const category = override.category || categoryForTool(name);
    return {
      name,
      label: override.label || titleizeToolName(name),
      description: tool.function.description || '',
      category,
      ...metadataForTool(name, category, tool.function.description),
      provider: override.provider || null,
      scopeKind: override.scopeKind || 'none',
      risk: override.risk || 'read',
      parameters: tool.function.parameters || null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

  const categories = [...new Set(tools.map(tool => tool.category))].map(category => ({
    id: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label: category,
    tools: tools.filter(tool => tool.category === category),
  }));

  const kits = [...new Set(tools.map(tool => tool.kit))].map(kit => ({
    id: kit.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label: kit,
    tools: tools.filter(tool => tool.kit === kit),
  }));

  return { tools, categories, kits };
}
