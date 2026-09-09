const MAX_TARGET_CHARS = 80;

function lineCount(value) {
  if (typeof value !== 'string' || value.length === 0) return 0;
  return value.split('\n').length;
}

function clipTarget(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > MAX_TARGET_CHARS ? `${text.slice(0, MAX_TARGET_CHARS)}…` : text;
}

// Compact, privacy-safe description of a tool call for the live activity
// stream and the persisted per-message activity strip. Never includes file
// contents or query bodies beyond a clipped target string.
export function summarizeToolCall(tool, args = {}) {
  switch (tool) {
    case 'project_edit':
      return args.path
        ? { path: args.path, added: lineCount(args.new_string), removed: lineCount(args.old_string) }
        : null;
    case 'project_multi_edit': {
      const edits = Array.isArray(args.edits) ? args.edits.filter(e => e && typeof e === 'object') : [];
      if (edits.length === 0) return null;
      const paths = [...new Set(edits.map(e => e.path).filter(Boolean))];
      return {
        path: paths[0],
        files: paths.length,
        added: edits.reduce((n, e) => n + lineCount(e.new_string), 0),
        removed: edits.reduce((n, e) => n + lineCount(e.old_string), 0),
      };
    }
    case 'project_write':
      return args.path ? { path: args.path, added: lineCount(args.content) } : null;
    case 'local_write_file':
      return args.file_path ? { path: args.file_path, added: lineCount(args.content) } : null;
    case 'github_write_file':
      return args.path
        ? { path: args.path, added: lineCount(args.content), target: clipTarget(args.repo) }
        : null;
    case 'project_read':
    case 'project_file_outline':
      return args.path ? { path: args.path } : null;
    case 'local_read_file':
      return args.file_path ? { path: args.file_path } : null;
    case 'github_read_file':
      return args.path ? { path: args.path, target: clipTarget(args.repo) } : null;
    case 'project_list':
      return args.path ? { path: args.path } : null;
    case 'local_list_dir':
      return args.dir_path ? { path: args.dir_path } : null;
    case 'web_search':
    case 'recall':
    case 'read_journal_search':
      return args.query ? { target: clipTarget(args.query) } : null;
    case 'query_knowledge':
      return args.subject ? { target: clipTarget(args.subject) } : null;
    case 'message_to':
      return args.agent ? { target: clipTarget(args.agent) } : null;
    default:
      return null;
  }
}
