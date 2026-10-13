import { baseName, clip } from './shared.js';

/**
 * Codex CLI in headless mode:
 *   codex exec --json --sandbox workspace-write --skip-git-repo-check -
 *   codex exec --json ... resume <thread_id> -
 *
 * The task is read from stdin (`-`). `codex exec` never stops to ask: its
 * gate is the sandbox, which lets it write only inside the task's worktree
 * and keeps the network off. JSONL events: thread.started, turn.*,
 * item.started / item.updated / item.completed with item types
 * agent_message, reasoning, command_execution, file_change, mcp_tool_call,
 * web_search, todo_list, error.
 */

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function itemOps(item, phase) {
  const id = `codex-${item.id}`;
  const done = phase === 'completed';
  switch (item.type) {
    case 'agent_message':
      return done && item.text?.trim() ? [{ op: 'add', item: { id, kind: 'message', role: 'assistant', text: item.text } }] : [];
    case 'reasoning':
      return done && item.text?.trim() ? [{ op: 'add', item: { id, kind: 'thinking', text: clip(item.text, 4000) } }] : [];
    case 'command_execution': {
      const status = item.status === 'failed' || (done && item.exit_code && item.exit_code !== 0) ? 'error' : done ? 'ok' : 'running';
      const patch = { status, output: clip(item.aggregated_output || ''), exitCode: item.exit_code ?? null };
      return phase === 'started'
        ? [{ op: 'add', item: { id, kind: 'command', tool: 'shell', title: 'Run command', command: item.command || '', ...patch } }]
        : [{ op: 'upsert', item: { id, kind: 'command', tool: 'shell', title: 'Run command', command: item.command || '', ...patch } }];
    }
    case 'file_change': {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      const title = changes.length === 1
        ? `${changes[0].kind === 'add' ? 'Write' : changes[0].kind === 'delete' ? 'Delete' : 'Edit'} ${baseName(changes[0].path)}`
        : `Edit ${changes.length} files`;
      return [{ op: 'upsert', item: { id, kind: 'edit', tool: 'apply_patch', title, path: changes[0]?.path || '', files: changes.map((c) => ({ path: c.path, kind: c.kind })), status: item.status === 'failed' ? 'error' : done ? 'ok' : 'running' } }];
    }
    case 'mcp_tool_call':
      return [{ op: 'upsert', item: { id, kind: 'tool', tool: `${item.server}.${item.tool}`, title: `${item.server} · ${item.tool}`, status: item.status === 'failed' ? 'error' : done ? 'ok' : 'running' } }];
    case 'web_search':
      return [{ op: 'upsert', item: { id, kind: 'search', tool: 'web_search', title: `Search ${clip(item.query || '', 80)}`, query: item.query || '', status: done ? 'ok' : 'running' } }];
    case 'todo_list':
      return [{ op: 'upsert', item: { id, kind: 'todo', tool: 'todo_list', title: 'Plan', todos: (item.items || []).map((t) => ({ text: t.text, status: t.completed ? 'completed' : 'pending' })), status: 'ok' } }];
    case 'error':
      return [{ op: 'add', item: { id, kind: 'error', text: item.message || 'Codex reported an error.' } }];
    default:
      return [];
  }
}

export const codex = {
  id: 'codex',
  label: 'Codex',
  vendor: 'OpenAI',
  binary: 'codex',
  npmPackage: '@openai/codex',
  keyEnv: 'OPENAI_API_KEY',
  vaultProvider: 'openai',
  loginFiles: ['.codex/auth.json'],
  homepage: 'https://github.com/openai/codex',
  gate: 'sandbox',
  gateNote: 'Runs sandboxed: it can write only inside this task’s worktree, with no network.',

  buildRun({ resumeSessionId, model, task }) {
    const args = ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check'];
    if (model && SAFE_ID.test(model)) args.push('--model', model);
    if (resumeSessionId && SAFE_ID.test(resumeSessionId)) args.push('resume', resumeSessionId);
    args.push('-');
    return { args, stdin: [task], keepStdinOpen: false };
  },

  createParser() {
    return function parse(event) {
      if (!event || typeof event !== 'object') return [];
      switch (event.type) {
        case 'thread.started':
          return [{ op: 'meta', patch: { sessionId: event.thread_id || null } }];
        case 'item.started':
          return itemOps(event.item || {}, 'started');
        case 'item.updated':
          return itemOps(event.item || {}, 'updated');
        case 'item.completed':
          return itemOps(event.item || {}, 'completed');
        case 'turn.completed':
          return [
            { op: 'meta', patch: { usage: event.usage ? { input: event.usage.input_tokens, output: event.usage.output_tokens } : undefined } },
            { op: 'done', ok: true, summary: null },
          ];
        case 'turn.failed':
          return [{ op: 'done', ok: false, summary: event.error?.message || 'Codex stopped with an error.' }];
        case 'error':
          return [{ op: 'add', item: { id: `codex-err-${Date.now()}`, kind: 'error', text: event.message || 'Codex reported an error.' } }];
        default:
          return [];
      }
    };
  },
};
