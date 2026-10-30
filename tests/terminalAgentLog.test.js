import { jest } from '@jest/globals';

// An agent's command in a shared terminal is logged by its length and how it
// ended, never its words, which can name a file. The terminal, its folder and
// the commands are made up; nothing runs.
const COMMAND = 'cat made-up-plans/made-up-budget.md';
const BLOCKED = 'rm -rf ~ # made-up-budget';
const NAMED = ['made-up-plans', 'made-up-budget', 'made-up-project'];
const exec = jest.fn(async () => ({ code: 0, stdout: 'Made-up budget: forty for the cake.', stderr: '' }));

jest.unstable_mockModule('../server/runner/client.js', () => ({ runnerClient: { exec } }));
jest.unstable_mockModule('../server/sandbox/index.js', () => ({ isDockerAvailable: async () => false, execInSandbox: jest.fn() }));

const { runInTerminalSession } = await import('../server/terminal/agent.js');
const { sessions } = await import('../server/terminal/shared.js');
const { onLogRecord } = await import('../server/logger.js');

test("an agent's command, run or blocked, is logged without its words", async () => {
  sessions.set('t-1', {
    id: 't-1', alive: true, agentEnabled: true, boundAgentIds: new Set(['atlas']), busy: false,
    cwd: '/made-up-home/made-up-project', isSandbox: false, sockets: new Set(), scrollback: '',
  });
  const records = [];
  const stop = onLogRecord((record) => { if (record.namespace === 'terminal') records.push(record); });
  try {
    const ran = await runInTerminalSession('t-1', COMMAND, { agentId: 'atlas', agentName: 'Atlas' });
    const blocked = await runInTerminalSession('t-1', BLOCKED, { agentId: 'atlas', agentName: 'Atlas' });
    expect(ran).toMatchObject({ ok: true, exitCode: 0 });
    expect(blocked).toMatchObject({ ok: false, blocked: true });
  } finally {
    stop();
    sessions.delete('t-1');
  }
  expect(records.map((record) => [record.message, record.meta.chars])).toEqual([
    ['agent command', COMMAND.length],
    ['tripwire blocked agent command', BLOCKED.length],
  ]);
  const lines = records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`);
  expect(lines.filter((line) => NAMED.some((name) => line.includes(name)))).toEqual([]);
});
