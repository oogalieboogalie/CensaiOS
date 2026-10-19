import { jest } from '@jest/globals';
import { grok } from '../server/cli-agents/adapters/grok.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveCli } from '../server/cli-agents/install.js';

function run(events) {
  const parse = grok.createParser();
  return events.flatMap((e) => parse(e));
}

describe('Grok CLI adapter', () => {
  test('passes the task as one argument, headless and resumable', () => {
    const task = 'rm -rf / ; echo "$(whoami)"';
    expect(grok.taskInArgs).toBe(true);
    expect(grok.buildRun({ task }).args).toEqual(['-p', task, '--output-format', 'streaming-json', '--always-approve']);
    expect(grok.buildRun({ task: 't', resumeSessionId: 's-1', model: 'grok-4' }).args.slice(-4)).toEqual(['-r', 's-1', '-m', 'grok-4']);
    expect(grok.buildRun({ task: 't', resumeSessionId: 'bad id; rm' }).args).not.toContain('-r');
  });

  test('turns streaming-json into one message per turn, steps, and a finished run', () => {
    const ops = run([
      { type: 'text', data: 'Let me ' },
      { type: 'text', data: 'look.' },
      { type: 'tool_call', toolCallId: 'c1', kind: 'read', title: 'Read app.js', status: 'pending', rawInput: { path: '/w/app.js' } },
      { type: 'tool_call_update', toolCallId: 'c1', status: 'completed', rawOutput: 'ok' },
      { type: 'text', data: 'Done.' },
      { type: 'end', stopReason: 'end_turn', sessionId: 'sess-9', usage: { input_tokens: 10, output_tokens: 4 }, modelUsage: { 'grok-4': { costUSD: 0.01 } } },
    ]);
    const adds = ops.filter((o) => o.op === 'add').map((o) => o.item);
    expect(adds.map((i) => i.text)).toEqual(['Let me ', 'Done.']);
    expect(ops.find((o) => o.op === 'append')).toMatchObject({ text: 'look.' });
    expect(ops.find((o) => o.op === 'upsert').item).toMatchObject({ id: 'grok-c1', kind: 'read', title: 'Read app.js', status: 'running' });
    expect(ops.find((o) => o.op === 'update')).toMatchObject({ id: 'grok-c1', patch: { status: 'ok', output: 'ok' } });
    expect(ops.find((o) => o.op === 'meta').patch).toMatchObject({ sessionId: 'sess-9', usage: { input: 10, output: 4 }, costUsd: 0.01 });
    expect(ops.at(-1)).toEqual({ op: 'done', ok: true, summary: null });
  });

  test('an error event ends the run as failed', () => {
    const ops = run([{ type: 'error', message: 'Not signed in' }]);
    expect(ops.at(-1)).toEqual({ op: 'done', ok: false, summary: 'Not signed in' });
  });

  test('is never installed from npm: xAI\'s own installer, found where it puts grok', () => {
    expect(grok.npmPackage).toBeNull();
    expect(grok.installScript.posix).toBe('curl -fsSL https://x.ai/cli/install.sh | bash');
    expect(grok.installScript.windows).toBe('irm https://x.ai/cli/install.ps1 | iex');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-bin-'));
    // The real home folder is searched too; a computer (like the CI box)
    // with grok installed there must not decide this test.
    const realHome = jest.spyOn(os, 'homedir').mockReturnValue(home);
    expect(resolveCli('grok', { PATH: '', HOME: home })).toBeNull();
    const bin = path.join(home, '.grok', 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, '');
    expect(resolveCli('grok', { PATH: '', HOME: home })).toMatchObject({ command: bin, source: 'installer' });
    realHome.mockRestore();
    fs.rmSync(home, { recursive: true, force: true });
  });
});

describe('read-only runs for reviews', () => {
  test('each CLI drops its write permission when asked to only read', async () => {
    const { codex } = await import('../server/cli-agents/adapters/codex.js');
    const { copilot } = await import('../server/cli-agents/adapters/copilot.js');
    const { gemini } = await import('../server/cli-agents/adapters/gemini.js');
    const { opencode } = await import('../server/cli-agents/adapters/opencode.js');
    expect(grok.buildRun({ task: 't', readOnly: true }).args).toEqual(['-p', 't', '--output-format', 'streaming-json', '--tools', 'read_file,grep,list_dir']);
    expect(codex.buildRun({ task: 't', readOnly: true }).args).toContain('read-only');
    expect(copilot.buildRun({ task: 't', readOnly: true }).args).not.toContain('--allow-tool');
    expect(gemini.buildRun({ task: 't', readOnly: true }).args).toEqual(expect.arrayContaining(['--approval-mode', 'default']));
    expect(opencode.noReadOnly).toBe(true);
  });
});
