/**
 * Shared helpers for CLI agent adapters.
 *
 * Every adapter turns one CLI's structured output (JSON lines) into the same
 * small set of transcript operations, so the Agent Console renders Claude
 * Code, Codex, Gemini CLI and OpenCode with one set of step cards:
 *
 *   { op: 'meta', patch }               session id, model, cost, usage
 *   { op: 'add', item }                 a new transcript item
 *   { op: 'update', id, patch }         fill in an item (tool result, status)
 *   { op: 'append', id, text }          stream more text into a message item
 *   { op: 'permission', request }       the CLI is waiting for allow/deny
 *   { op: 'done', ok, summary }         the run finished
 *
 * Item kinds: message, thinking, read, edit, command, search, tool, todo,
 * error, note. Edit items carry { path, before, after } when the CLI tells
 * us the strings, so the console can draw an inline diff before the files
 * panel (the authoritative `git diff`) catches up.
 */

export const MAX_OUTPUT_CHARS = 6000;
export const MAX_DIFF_CHARS = 20000;

export function clip(value, max = MAX_OUTPUT_CHARS) {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max)}\n… [${text.length - max} more characters]`;
}

/** Tool results arrive as strings, block arrays, or objects. Flatten to text. */
export function resultText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text') return block.text || '';
      if (block?.type === 'image') return '[image]';
      return block?.text || '';
    }).join('\n');
  }
  if (typeof content === 'object') return content.text || content.output || JSON.stringify(content);
  return String(content);
}

export function baseName(p) {
  const text = String(p || '');
  const parts = text.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || text;
}

/**
 * Map a tool call (name + input) from any CLI onto a typed step.
 * `aliases` lets each adapter say which of its tool names mean what.
 */
export function stepFromTool({ id, name, input = {}, aliases }) {
  const kind = aliases[name] || 'tool';
  const path = input.file_path || input.absolute_path || input.path || input.notebook_path || '';
  const base = { id, kind, tool: name, status: 'running' };
  if (kind === 'read') {
    return { ...base, title: `Read ${baseName(path) || 'file'}`, path };
  }
  if (kind === 'edit') {
    const before = typeof input.old_string === 'string' ? input.old_string : null;
    const after = typeof input.new_string === 'string'
      ? input.new_string
      : typeof input.content === 'string' ? input.content : null;
    const isNew = typeof input.content === 'string' && before == null;
    return {
      ...base,
      title: `${isNew ? 'Write' : 'Edit'} ${baseName(path) || 'file'}`,
      path,
      diff: after == null ? null : { path, before: before ? clip(before, MAX_DIFF_CHARS) : '', after: clip(after, MAX_DIFF_CHARS), isNew },
    };
  }
  if (kind === 'command') {
    const command = String(input.command || input.cmd || '');
    return { ...base, title: input.description || 'Run command', command };
  }
  if (kind === 'search') {
    const query = input.pattern || input.query || input.glob || input.url || '';
    return { ...base, title: `${name} ${clip(String(query), 80)}`.trim(), query: String(query) };
  }
  if (kind === 'todo') {
    const todos = Array.isArray(input.todos) ? input.todos : [];
    return { ...base, title: 'Plan', todos: todos.map((t) => ({ text: t.content || t.text || '', status: t.status || 'pending' })) };
  }
  return { ...base, title: name, input: clip(input, 1200) };
}

/** Human summary of a permission request, used on approve/deny cards. */
export function describePermission(toolName, input = {}, aliases = {}) {
  const step = stepFromTool({ id: 'perm', name: toolName, input, aliases });
  if (step.kind === 'command') return { title: `Run a command`, detail: step.command, kind: step.kind };
  if (step.kind === 'edit') return { title: `${step.title}`, detail: step.path, kind: step.kind, diff: step.diff };
  if (step.kind === 'read') return { title: step.title, detail: step.path, kind: step.kind };
  return { title: `Use ${toolName}`, detail: clip(input, 600), kind: step.kind };
}

/** Parse one stdout line. Non-JSON lines come back as { raw }. */
export function parseJsonLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  if (text[0] !== '{') return { raw: text };
  try {
    return { event: JSON.parse(text) };
  } catch {
    return { raw: text };
  }
}
