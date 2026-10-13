import { clip, stepFromTool } from './shared.js';

/**
 * OpenCode in headless mode:
 *   opencode run --format json [--session <id>] <task>
 *
 * OpenCode takes the task as an argument (there is no stdin prompt mode),
 * so the adapter passes it as one argv element and never through a shell.
 * Its JSON events carry a `part`: text, tool (with state.input / output),
 * step_finish (cost). Lines that are not JSON show up as plain text, so an
 * older OpenCode without --format json still gives a readable transcript.
 */

const ALIASES = {
  read: 'read', write: 'edit', edit: 'edit', patch: 'edit',
  bash: 'command', grep: 'search', glob: 'search', list: 'search', webfetch: 'search', todowrite: 'todo',
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const opencode = {
  id: 'opencode',
  label: 'OpenCode',
  vendor: 'SST',
  binary: 'opencode',
  npmPackage: 'opencode-ai',
  keyEnv: 'OPENCODE_API_KEY',
  vaultProvider: 'opencode',
  loginFiles: ['.local/share/opencode/auth.json'],
  homepage: 'https://opencode.ai',
  gate: 'config',
  gateNote: 'Follows the permission rules in your OpenCode config.',
  aliases: ALIASES,
  taskInArgs: true,

  buildRun({ task, resumeSessionId, model }) {
    const args = ['run', '--format', 'json'];
    if (model && SAFE_ID.test(model)) args.push('--model', model);
    if (resumeSessionId && SAFE_ID.test(resumeSessionId)) args.push('--session', resumeSessionId);
    args.push(task);
    return { args, stdin: [], keepStdinOpen: false };
  },

  createParser() {
    let count = 0;
    return function parse(event, raw) {
      if (raw) return [{ op: 'add', item: { id: `oc-raw-${count++}`, kind: 'message', role: 'assistant', text: raw } }];
      if (!event || typeof event !== 'object') return [];
      const ops = [];
      if (event.sessionID) ops.push({ op: 'meta', patch: { sessionId: event.sessionID } });
      const part = event.part || {};
      if (event.type === 'text' && part.text?.trim()) {
        ops.push({ op: 'add', item: { id: `oc-${part.id || count++}`, kind: 'message', role: 'assistant', text: part.text } });
      } else if (event.type === 'tool_use' || part.type === 'tool') {
        const state = part.state || {};
        const step = stepFromTool({ id: `oc-${part.callID || part.id || count++}`, name: part.tool, input: state.input || {}, aliases: ALIASES });
        ops.push({ op: 'upsert', item: { ...step, status: state.status === 'error' ? 'error' : state.status === 'completed' ? 'ok' : 'running', output: clip(state.output || state.error || '') } });
      } else if (event.type === 'step_finish' && typeof part.cost === 'number') {
        ops.push({ op: 'meta', patch: { costDelta: part.cost } });
      } else if (event.type === 'error') {
        ops.push({ op: 'add', item: { id: `oc-err-${count++}`, kind: 'error', text: event.error?.data?.message || event.error?.message || 'OpenCode reported an error.' } });
      }
      return ops;
    };
  },
};
