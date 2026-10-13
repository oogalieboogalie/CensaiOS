import { clip, resultText, stepFromTool } from './shared.js';

/**
 * Gemini CLI in headless mode:
 *   gemini --output-format stream-json --approval-mode auto_edit [--resume <id>]
 *
 * The task is piped on stdin (non-interactive when stdin is not a TTY).
 * In headless mode Gemini CLI cannot stop and ask, so the gate is its
 * approval mode: auto_edit lets it read and edit files in the worktree and
 * leaves out tools that would need a yes, such as shell commands.
 * Events: init, message (delta), tool_use, tool_result, error, result.
 */

const ALIASES = {
  read_file: 'read', read_many_files: 'read',
  write_file: 'edit', replace: 'edit', edit: 'edit',
  run_shell_command: 'command',
  glob: 'search', search_file_content: 'search', grep: 'search', list_directory: 'search',
  web_fetch: 'search', google_web_search: 'search',
  write_todos: 'todo',
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const gemini = {
  id: 'gemini',
  label: 'Gemini CLI',
  vendor: 'Google',
  binary: 'gemini',
  npmPackage: '@google/gemini-cli',
  keyEnv: 'GEMINI_API_KEY',
  vaultProvider: 'google',
  loginFiles: ['.gemini/oauth_creds.json'],
  homepage: 'https://github.com/google-gemini/gemini-cli',
  gate: 'auto-edit',
  gateNote: 'Edits files in its worktree on its own; shell commands stay off in headless mode.',
  aliases: ALIASES,

  buildRun({ task, resumeSessionId, model }) {
    const args = ['--output-format', 'stream-json', '--approval-mode', 'auto_edit'];
    if (model && SAFE_ID.test(model)) args.push('--model', model);
    if (resumeSessionId && SAFE_ID.test(resumeSessionId)) args.push('--resume', resumeSessionId);
    return { args, stdin: [task], keepStdinOpen: false };
  },

  createParser() {
    let current = null;
    let count = 0;
    return function parse(event) {
      if (!event || typeof event !== 'object') return [];
      switch (event.type) {
        case 'init':
          return [{ op: 'meta', patch: { sessionId: event.session_id || null, model: event.model || null } }];
        case 'message': {
          if (event.role !== 'assistant') return [];
          const text = String(event.content || '');
          if (event.delta && current) return [{ op: 'append', id: current, text }];
          current = `gem-msg-${count++}`;
          return [{ op: 'add', item: { id: current, kind: 'message', role: 'assistant', text } }];
        }
        case 'tool_use':
          current = null;
          return [{ op: 'add', item: stepFromTool({ id: `gem-${event.tool_id}`, name: event.tool_name, input: event.parameters || {}, aliases: ALIASES }) }];
        case 'tool_result':
          return [{
            op: 'update',
            id: `gem-${event.tool_id}`,
            patch: { status: event.status === 'success' ? 'ok' : 'error', output: clip(resultText(event.output ?? event.error?.message ?? '')) },
          }];
        case 'error':
          return [{ op: 'add', item: { id: `gem-err-${count++}`, kind: 'error', text: event.message || 'Gemini CLI reported an error.' } }];
        case 'result': {
          const stats = event.stats || {};
          return [
            { op: 'meta', patch: { durationMs: stats.duration_ms, usage: { input: stats.input_tokens, output: stats.output_tokens } } },
            { op: 'done', ok: event.status === 'success', summary: event.status === 'success' ? null : (event.error?.message || 'Gemini CLI stopped with an error.') },
          ];
        }
        default:
          return [];
      }
    };
  },
};
