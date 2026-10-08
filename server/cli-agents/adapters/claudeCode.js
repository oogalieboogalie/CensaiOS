import { clip, describePermission, resultText, stepFromTool } from './shared.js';

/**
 * Claude Code in headless mode:
 *   claude -p --input-format stream-json --output-format stream-json --verbose
 *          --permission-prompt-tool stdio [--resume <session>] [--model <m>]
 *
 * The task goes in on stdin as one user message, so it never touches a shell
 * command line. With `--permission-prompt-tool stdio` Claude Code asks before
 * each tool call it is not already allowed to make by writing a
 * `control_request` (subtype can_use_tool) to stdout and waiting for our
 * `control_response` on stdin. That is the console's approve/deny card.
 */

const ALIASES = {
  Read: 'read', NotebookRead: 'read',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'command', BashOutput: 'command',
  Grep: 'search', Glob: 'search', LS: 'search', WebFetch: 'search', WebSearch: 'search',
  TodoWrite: 'todo',
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const claudeCode = {
  id: 'claudecode',
  label: 'Claude Code',
  vendor: 'Anthropic',
  binary: 'claude',
  npmPackage: '@anthropic-ai/claude-code',
  keyEnv: 'ANTHROPIC_API_KEY',
  vaultProvider: 'anthropic',
  loginFiles: ['.claude/.credentials.json'],
  homepage: 'https://docs.anthropic.com/en/docs/claude-code',
  gate: 'asks',
  gateNote: 'Asks before each command or edit it is not already allowed to make.',
  aliases: ALIASES,

  buildRun({ task, resumeSessionId, model }) {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--permission-prompt-tool', 'stdio'];
    if (resumeSessionId && SAFE_ID.test(resumeSessionId)) args.push('--resume', resumeSessionId);
    if (model && SAFE_ID.test(model)) args.push('--model', model);
    const message = {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'text', text: task }] },
    };
    // Keep stdin open: permission answers travel on it. Closed after `result`.
    return { args, stdin: [JSON.stringify(message)], keepStdinOpen: true };
  },

  permissionReply(request, decision) {
    const response = decision.allow
      ? { behavior: 'allow', updatedInput: request.input || {} }
      : { behavior: 'deny', message: decision.message || 'Denied by a teammate in Homebase.' };
    return JSON.stringify({
      type: 'control_response',
      response: { subtype: 'success', request_id: request.requestId, response },
    });
  },

  createParser() {
    let messageCount = 0;
    return function parse(event) {
      const ops = [];
      if (!event || typeof event !== 'object') return ops;
      if (event.type === 'system' && event.subtype === 'init') {
        ops.push({ op: 'meta', patch: { sessionId: event.session_id || null, model: event.model || null } });
        return ops;
      }
      if (event.type === 'assistant' && event.message) {
        for (const block of event.message.content || []) {
          if (block.type === 'text' && block.text?.trim()) {
            ops.push({ op: 'add', item: { id: `msg-${event.message.id || 'm'}-${messageCount++}`, kind: 'message', role: 'assistant', text: block.text } });
          } else if (block.type === 'thinking' && block.thinking?.trim()) {
            ops.push({ op: 'add', item: { id: `think-${messageCount++}`, kind: 'thinking', text: clip(block.thinking, 4000) } });
          } else if (block.type === 'tool_use') {
            ops.push({ op: 'add', item: stepFromTool({ id: block.id, name: block.name, input: block.input || {}, aliases: ALIASES }) });
          }
        }
        return ops;
      }
      if (event.type === 'user' && event.message && Array.isArray(event.message.content)) {
        for (const block of event.message.content) {
          if (block.type !== 'tool_result') continue;
          ops.push({
            op: 'update',
            id: block.tool_use_id,
            patch: { status: block.is_error ? 'error' : 'ok', output: clip(resultText(block.content)) },
          });
        }
        return ops;
      }
      if (event.type === 'control_request' && event.request) {
        const req = event.request;
        if (req.subtype === 'can_use_tool') {
          ops.push({
            op: 'permission',
            request: {
              requestId: event.request_id,
              tool: req.tool_name,
              input: req.input || {},
              toolUseId: req.tool_use_id || null,
              ...describePermission(req.tool_name, req.input || {}, ALIASES),
            },
          });
        } else {
          // Hooks, MCP bridging etc. are not used by Homebase; say so instead of hanging the CLI.
          ops.push({
            op: 'reply',
            line: JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: event.request_id, error: `Homebase does not handle ${req.subtype}` } }),
          });
        }
        return ops;
      }
      if (event.type === 'result') {
        ops.push({
          op: 'meta',
          patch: {
            sessionId: event.session_id || undefined,
            costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined,
            durationMs: event.duration_ms,
            turns: event.num_turns,
            usage: event.usage ? { input: event.usage.input_tokens, output: event.usage.output_tokens } : undefined,
          },
        });
        ops.push({ op: 'done', ok: !event.is_error && event.subtype === 'success', summary: clip(event.result || '', 4000) });
      }
      return ops;
    };
  },
};
