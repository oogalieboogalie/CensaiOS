import { claudeCode } from '../server/cli-agents/adapters/claudeCode.js';
import { codex } from '../server/cli-agents/adapters/codex.js';
import { gemini } from '../server/cli-agents/adapters/gemini.js';
import { opencode } from '../server/cli-agents/adapters/opencode.js';
import { CLI_IDS, getAdapter } from '../server/cli-agents/adapters/index.js';

function run(adapter, events) {
  const parse = adapter.createParser();
  return events.flatMap((e) => parse(e));
}

describe('CLI agent adapters', () => {
  test('registry covers the four coding CLIs from spec 8', () => {
    expect(CLI_IDS).toEqual(['claudecode', 'codex', 'gemini', 'opencode']);
    expect(getAdapter('CODEX')).toBe(codex);
    expect(getAdapter('nope')).toBeNull();
  });

  test('task text never travels as a shell argument for stdin-capable CLIs', () => {
    const task = 'rm -rf / ; echo "$(whoami)"';
    for (const adapter of [claudeCode, codex, gemini]) {
      const run = adapter.buildRun({ task });
      expect(run.args.join(' ')).not.toContain('whoami');
    }
    expect(opencode.buildRun({ task }).args.at(-1)).toBe(task);
  });

  test('unsafe resume ids and models are dropped', () => {
    const run = claudeCode.buildRun({ task: 'x', resumeSessionId: 'abc; rm -rf ~', model: '$(id)' });
    expect(run.args).not.toContain('--resume');
    expect(run.args).not.toContain('--model');
  });

  test('Claude Code stream-json becomes typed steps, permissions and a result', () => {
    // Shapes captured from the real claude 2.1.x binary (see PR notes).
    const ops = run(claudeCode, [
      { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-x', cwd: '/w' },
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: '/w/a.js', old_string: 'a', new_string: 'b' } }] } },
      { type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Edit', input: { file_path: '/w/a.js', old_string: 'a', new_string: 'b' }, tool_use_id: 'tu1' } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok', is_error: false }] } },
      { type: 'control_request', request_id: 'r2', request: { subtype: 'hook_callback' } },
      { type: 'result', subtype: 'success', is_error: false, result: 'Changed a to b', session_id: 'sess-1', total_cost_usd: 0.02, num_turns: 2 },
    ]);
    expect(ops[0]).toEqual({ op: 'meta', patch: { sessionId: 'sess-1', model: 'claude-x' } });
    expect(ops[1].item).toMatchObject({ kind: 'message', text: 'Looking.' });
    expect(ops[2].item).toMatchObject({ id: 'tu1', kind: 'edit', path: '/w/a.js', diff: { before: 'a', after: 'b' } });
    expect(ops[3]).toMatchObject({ op: 'permission', request: { requestId: 'r1', tool: 'Edit', toolUseId: 'tu1', kind: 'edit' } });
    expect(ops[4]).toMatchObject({ op: 'update', id: 'tu1', patch: { status: 'ok', output: 'ok' } });
    expect(ops[5].op).toBe('reply');
    expect(JSON.parse(ops[5].line).response).toMatchObject({ subtype: 'error', request_id: 'r2' });
    expect(ops.at(-1)).toEqual({ op: 'done', ok: true, summary: 'Changed a to b' });
  });

  test('Claude Code permission replies match the stdio control protocol', () => {
    const request = { requestId: 'r9', input: { command: 'ls' } };
    expect(JSON.parse(claudeCode.permissionReply(request, { allow: true }))).toEqual({
      type: 'control_response',
      response: { subtype: 'success', request_id: 'r9', response: { behavior: 'allow', updatedInput: { command: 'ls' } } },
    });
    const deny = JSON.parse(claudeCode.permissionReply(request, { allow: false, message: 'no' }));
    expect(deny.response.response).toEqual({ behavior: 'deny', message: 'no' });
  });

  test('Codex exec --json items map onto commands, file changes and messages', () => {
    const ops = run(codex, [
      { type: 'thread.started', thread_id: 'th-1' },
      { type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'npm test', aggregated_output: '', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'npm test', aggregated_output: 'pass', exit_code: 0, status: 'completed' } },
      { type: 'item.completed', item: { id: 'i2', type: 'file_change', changes: [{ path: 'src/a.js', kind: 'update' }], status: 'completed' } },
      { type: 'item.completed', item: { id: 'i3', type: 'agent_message', text: 'All good.' } },
      { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    expect(ops[0]).toEqual({ op: 'meta', patch: { sessionId: 'th-1' } });
    expect(ops[1]).toMatchObject({ op: 'add', item: { id: 'codex-i1', kind: 'command', status: 'running' } });
    expect(ops[2]).toMatchObject({ op: 'upsert', item: { id: 'codex-i1', status: 'ok', output: 'pass', exitCode: 0 } });
    expect(ops[3].item).toMatchObject({ kind: 'edit', title: 'Edit a.js', files: [{ path: 'src/a.js', kind: 'update' }] });
    expect(ops[4].item).toMatchObject({ kind: 'message', text: 'All good.' });
    expect(ops.at(-1)).toEqual({ op: 'done', ok: true, summary: null });
    expect(codex.buildRun({ task: 't', resumeSessionId: 'th-1' }).args.slice(-3)).toEqual(['resume', 'th-1', '-']);
  });

  test('Gemini CLI stream-json streams message deltas into one item', () => {
    const ops = run(gemini, [
      { type: 'init', session_id: 'g1', model: 'gemini-x' },
      { type: 'message', role: 'assistant', content: 'Hel', delta: true },
      { type: 'message', role: 'assistant', content: 'lo', delta: true },
      { type: 'tool_use', tool_name: 'replace', tool_id: 't1', parameters: { file_path: 'a.txt', old_string: 'x', new_string: 'y' } },
      { type: 'tool_result', tool_id: 't1', status: 'success', output: 'done' },
      { type: 'result', status: 'success', stats: { input_tokens: 3, output_tokens: 4, duration_ms: 10 } },
    ]);
    expect(ops[1]).toMatchObject({ op: 'add', item: { kind: 'message', text: 'Hel' } });
    expect(ops[2]).toEqual({ op: 'append', id: ops[1].item.id, text: 'lo' });
    expect(ops[3].item).toMatchObject({ id: 'gem-t1', kind: 'edit', diff: { before: 'x', after: 'y' } });
    expect(ops[4]).toMatchObject({ op: 'update', id: 'gem-t1', patch: { status: 'ok' } });
    expect(ops.at(-1)).toMatchObject({ op: 'done', ok: true });
  });

  test('OpenCode JSON parts and plain lines both produce a transcript', () => {
    const parse = opencode.createParser();
    expect(parse(null, 'plain line')[0].item).toMatchObject({ kind: 'message', text: 'plain line' });
    const ops = parse({ type: 'tool_use', sessionID: 's1', part: { type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', input: { command: 'ls' }, output: 'a\nb' } } });
    expect(ops[0]).toEqual({ op: 'meta', patch: { sessionId: 's1' } });
    expect(ops[1].item).toMatchObject({ id: 'oc-c1', kind: 'command', command: 'ls', status: 'ok', output: 'a\nb' });
  });
});
