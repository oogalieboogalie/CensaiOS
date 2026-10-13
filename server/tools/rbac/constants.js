import { FAMILY_DEFAULT_TOOL_NAMES } from './familyBaseline.js';

export const SHARED_SUB_AGENT_TOOLS = [
  'remember', 'recall', 'journal', 'read_journal', 'read_journal_search',
  'feeling', 'message_to', 'reply_to', 'read_messages',
  'project_read', 'project_file_outline', 'project_list', 'read_brief', 'report',
  'task_done',
];

export const SUB_AGENT_TOOL_WHITELIST = {
  worker: [
    ...SHARED_SUB_AGENT_TOOLS,
    'project_write', 'project_edit', 'refresh_brief', 'submit_pr',
    'jules_submit', 'jules_status', 'jules_list',
    'pr_status', 'pr_comments', 'merge_pr',
    'task_done',
  ],
  reviewer: [
    ...SHARED_SUB_AGENT_TOOLS,
    'jules_status', 'jules_list',
    'pr_status', 'pr_comments',
    'task_done',
  ],
  researcher: [
    ...SHARED_SUB_AGENT_TOOLS,
    'web_search', 'web_extract', 'web_extract',
    'lead_save', 'lead_list', 'lead_status',
    'jules_status', 'jules_list',
    'pr_status', 'pr_comments',
    'task_done',
  ],
};

export const AGENT_CLASS_TOOL_WHITELIST = {
  scout: [
    ...SHARED_SUB_AGENT_TOOLS,
    'web_search', 'web_extract', 'web_extract',
    'lead_save', 'lead_list', 'lead_status',
    'analyze_deps',
    'db_inspect',
    'container_status',
    'container_logs',
    'http_test',
    'run_linter',
    'jules_status', 'jules_list',
    'pr_status', 'pr_comments',
    'task_done',
  ],
  builder: [
    ...SHARED_SUB_AGENT_TOOLS,
    'project_write', 'project_edit', 'project_multi_edit', 'refresh_brief', 'submit_pr',
    'jules_submit', 'jules_status', 'jules_list',
    'pr_status', 'pr_comments', 'merge_pr',
    'run_tests', 'run_linter', 'sandbox_exec', 'terminal_run',
    'http_test',
    'task_done',
  ],
  auditor: [
    ...SHARED_SUB_AGENT_TOOLS,
    'web_search', 'web_extract',
    'db_inspect',
    'analyze_deps',
    'http_test',
    'run_linter',
    'jules_status', 'jules_list',
    'pr_status', 'pr_comments',
    'task_done',
  ],
  sentry: [
    ...SHARED_SUB_AGENT_TOOLS,
    'container_status', 'container_logs', 'http_test', 'db_inspect', 'web_search', 'web_extract', 'task_done',
  ],
};

export const CORE_AGENT_TOOL_WHITELIST = FAMILY_DEFAULT_TOOL_NAMES;

export const FULL_TOOL_ACCESS_AGENT_IDS = new Set([]);

export const TASK_SUBMISSION_GATED_TOOLS = [
  'local_git_status',
  'local_git_fetch',
  'local_git_pull_ff_only',
  'local_git_checkpoint',
  'local_git_verify',
];

