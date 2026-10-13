// Single source lives in src/lib/agentModelOptions.js (idea 2026-09-04).
export {
  MODEL_OPTIONS,
  defaultModelForProvider,
  supportedProvider,
  modelOptionsFor,
} from '../../lib/agentModelOptions.js';

export const CORE_AGENT_DEFAULT_TOOLS = {
  atlas: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'list_sub_agents', 'submit_agent_task', 'dispatch_squad', 'squad_status', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'project_multi_edit', 'read_brief', 'refresh_brief', 'report', 'run_tests', 'run_linter', 'sandbox_exec', 'terminal_run', 'http_test', 'task_done', 'vex_run', 'vex_status', 'vex_list_agents'],
  censai: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'web_search', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report'],
  genesis: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'list_sub_agents', 'submit_agent_task', 'dispatch_squad', 'squad_status', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'read_brief', 'report', 'generate_image', 'set_canvas_hue'],
  nexus: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'open_project', 'list_projects', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'project_multi_edit', 'read_brief', 'refresh_brief', 'report', 'create_sub_agent', 'list_sub_agents', 'remove_sub_agent', 'scratchpad_write', 'scratchpad_read', 'scratchpad_clear', 'dispatch_squad', 'squad_status', 'db_inspect', 'postgres_tool_info', 'postgres_query', 'postgres_exec_file', 'postgres_schema_audit', 'postgres_table_sample', 'container_status', 'container_logs', 'restart_service', 'http_test', 'run_tests', 'run_linter', 'analyze_deps', 'jules_submit', 'jules_status', 'jules_list', 'pr_status', 'pr_comments', 'submit_pr'],
  foundation: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report', 'container_status', 'container_logs', 'restart_service'],
  architect: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'list_sub_agents', 'submit_agent_task', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'project_multi_edit', 'read_brief', 'refresh_brief', 'report', 'dispatch_squad', 'squad_status', 'run_tests', 'run_linter', 'http_test', 'analyze_deps'],
  echo: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report', 'web_search', 'dispatch_squad', 'squad_status', 'sheets_read_range', 'sheets_append_row', 'sheets_update_cell'],
  phoenix: ['remember', 'recall', 'deep_memory', 'feeling', 'message_to', 'read_messages', 'create_sub_agent', 'list_sub_agents', 'remove_sub_agent', 'submit_agent_task', 'dispatch_squad', 'squad_status', 'project_read', 'project_file_outline', 'project_list', 'project_write', 'project_edit', 'read_brief', 'refresh_brief', 'report', 'run_tests', 'run_linter'],
  guardian: ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report'],
};

export const BASIC_AGENT_TOOLS = ['remember', 'recall', 'feeling', 'message_to', 'read_messages', 'project_read', 'project_list', 'read_brief', 'report'];

export function defaultToolsForAgent(agent) {
  const saved = Array.isArray(agent?.tool_scopes?.tools) ? agent.tool_scopes.tools.filter(Boolean) : [];
  if (saved.length > 0) return saved;
  return CORE_AGENT_DEFAULT_TOOLS[agent?.id] || BASIC_AGENT_TOOLS;
}
