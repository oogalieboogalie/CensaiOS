// Maps streamed tool status events to display strings for the live activity
// feed and the per-message activity strip. Pure module — no React.

const VERBS = [
  { tools: ['project_edit', 'project_multi_edit'], verb: 'Editing', past: 'Edited', icon: 'Tools' },
  { tools: ['project_write', 'local_write_file', 'github_write_file'], verb: 'Writing', past: 'Wrote', icon: 'Files' },
  { tools: ['project_read', 'project_file_outline', 'local_read_file', 'github_read_file'], verb: 'Reading', past: 'Read', icon: 'Files' },
  { tools: ['scout_find'], verb: 'Sending the scout to find the spot', past: 'Scout found the spot', icon: 'Eye' },
  { tools: ['scout_map'], verb: 'Checking the scout\'s map', past: 'Checked the scout\'s map', icon: 'Eye' },
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
  { tools: ['make_module'], verb: 'Building module', past: 'Built module', icon: 'Toolbox' },
  { tools: ['read_module'], verb: 'Reading module', past: 'Read module', icon: 'Toolbox' },
  { tools: ['use_module'], verb: 'Using module', past: 'Used module', icon: 'Toolbox' },
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

/** { server, tool } for an outside MCP tool call, else null. */
export function outsideTool(tool, summary) {
  if (summary?.outsideServer) return { server: summary.outsideServer, tool: summary.outsideTool || tool };
  const match = /^mcp__([^_].*?)__(.+)$/.exec(String(tool || ''));
  return match ? { server: match[1], tool: match[2] } : null;
}

// detail: { tool, summary?, args?, ms?, ok? } from a calling_tool/completed_tool event.
export function describeToolEvent(detail, { past: pastTense = false } = {}) {
  const tool = detail?.tool || '';
  const group = VERB_BY_TOOL.get(tool);
  const summary = detail?.summary || null;
  // Older servers stream only args — fall back to common path fields.
  const path = summary?.path || detail?.args?.path || detail?.args?.file_path || detail?.args?.dir_path || '';
  const target = summary?.target || '';
  // Parked for a person's OK: not done and not failed, so say what it waits to do.
  const waiting = Boolean(summary?.waiting);
  const past = pastTense && !waiting;

  // Outside MCP tools (mcp__<server>__<tool>) name the tool and its server.
  const outside = outsideTool(tool, summary);
  let label = outside
    ? `${past ? 'Used' : 'Using'} ${outside.tool} from ${outside.server}`
    : group
      ? (past ? group.past : group.verb)
      : `${past ? 'Ran' : 'Running'} ${tool || 'tool'}`;
  if (!outside && path) {
    label = `${label} ${basename(path)}`;
    if (summary?.files > 1) label += ` (+${summary.files - 1} more)`;
  } else if (!outside && target) {
    label = `${label} “${target}”`;
  }

  return {
    icon: outside ? 'Plug' : (group ? group.icon : 'Tools'),
    outside,
    label,
    path,
    stats: diffStats(summary),
    ms: Number.isFinite(detail?.ms) ? detail.ms : null,
    // Harness-reported outcome. Absent on calling_tool events and on streams
    // from older servers — only an explicit false means the call failed.
    ok: detail?.ok !== false,
    waiting,
  };
}

export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}
