// Maps streamed tool status events to display strings for the live activity
// feed and the per-message activity strip. Pure module — no React.

const VERBS = [
  { tools: ['project_edit', 'project_multi_edit'], verb: 'Editing', past: 'Edited', icon: 'Tools' },
  { tools: ['project_write', 'local_write_file', 'github_write_file'], verb: 'Writing', past: 'Wrote', icon: 'Files' },
  { tools: ['project_read', 'project_file_outline', 'local_read_file', 'github_read_file'], verb: 'Reading', past: 'Read', icon: 'Files' },
  { tools: ['project_list', 'local_list_dir'], verb: 'Scanning', past: 'Scanned', icon: 'Folder' },
  { tools: ['remember', 'remember_important'], verb: 'Updating memory pool', past: 'Updated memory pool', icon: 'Memory' },
  { tools: ['journal', 'read_journal', 'read_journal_search'], verb: 'Tending private journal', past: 'Tended private journal', icon: 'Files' },
  { tools: ['recall', 'query_knowledge', 'know', 'associate', 'read_associations', 'nugget'], verb: 'Querying association network', past: 'Queried association network', icon: 'Memory' },
  { tools: ['feeling'], verb: 'Reflecting', past: 'Reflected', icon: 'Bot' },
  { tools: ['message_to', 'broadcast', 'read_messages'], verb: 'Messaging the team', past: 'Messaged the team', icon: 'Send' },
  { tools: ['web_search'], verb: 'Searching the web', past: 'Searched the web', icon: 'Search' },
  { tools: ['github_list_issues', 'github_create_issue', 'github_comment_issue'], verb: 'Syncing with GitHub', past: 'Synced with GitHub', icon: 'Files' },
  { tools: ['create_sub_agent', 'list_sub_agents', 'remove_sub_agent'], verb: 'Summoning sub-agent', past: 'Summoned sub-agent', icon: 'Bot' },
  { tools: ['submit_pr', 'pr_status', 'pr_comments', 'merge_pr'], verb: 'Reviewing pull requests', past: 'Reviewed pull requests', icon: 'Tools' },
  { tools: ['jules_submit', 'jules_status', 'jules_list'], verb: 'Dispatching Jules', past: 'Dispatched Jules', icon: 'Bot' },
  { tools: ['read_calendar', 'add_calendar_event'], verb: 'Consulting calendar', past: 'Consulted calendar', icon: 'Calendar' },
];

const VERB_BY_TOOL = new Map();
for (const group of VERBS) {
  for (const tool of group.tools) VERB_BY_TOOL.set(tool, group);
}

export function basename(path) {
  const text = String(path || '');
  const parts = text.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || text;
}

export function diffStats(summary) {
  if (!summary) return null;
  const added = Number.isFinite(summary.added) ? summary.added : null;
  const removed = Number.isFinite(summary.removed) ? summary.removed : null;
  if (!added && !removed) return null;
  return {
    added: added || 0,
    removed: removed || 0,
    label: [added ? `+${added}` : null, removed ? `−${removed}` : null].filter(Boolean).join(' '),
  };
}

// detail: { tool, summary?, args?, ms?, ok? } from a calling_tool/completed_tool event.
export function describeToolEvent(detail, { past = false } = {}) {
  const tool = detail?.tool || '';
  const group = VERB_BY_TOOL.get(tool);
  const summary = detail?.summary || null;
  // Older servers stream only args — fall back to common path fields.
  const path = summary?.path || detail?.args?.path || detail?.args?.file_path || detail?.args?.dir_path || '';
  const target = summary?.target || '';

  let label = group
    ? (past ? group.past : group.verb)
    : `${past ? 'Ran' : 'Running'} ${tool || 'tool'}`;
  if (path) {
    label = `${label} ${basename(path)}`;
    if (summary?.files > 1) label += ` (+${summary.files - 1} more)`;
  } else if (target) {
    label = `${label} “${target}”`;
  }

  return {
    icon: group ? group.icon : 'Tools',
    label,
    path,
    stats: diffStats(summary),
    ms: Number.isFinite(detail?.ms) ? detail.ms : null,
    // Harness-reported outcome. Absent on calling_tool events and on streams
    // from older servers — only an explicit false means the call failed.
    ok: detail?.ok !== false,
  };
}

export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}
