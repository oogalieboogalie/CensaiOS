import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));

const { onLogRecord } = await import('../server/logger.js');
const { createRelayLink } = await import('../server/agentNetwork/relayLink.js');
const { publish } = await import('../server/workflows/runner.js');

const SECRET = 'made-up-secret-139 answer text from another censaiOS';
const failure = () => Object.assign(new Error(SECRET), { code: 'ETIMEDOUT' });

function capture() {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  return { records, stop };
}

test('a relayed call that fails logs a code, never the other side\'s text', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ calls: [{ id: 'call-1', endpointId: 'ep-1', kind: 'ask' }] }) });
  const link = createRelayLink({
    relayUrl: 'https://relay.example.invalid', fetchImpl,
    getSigner: async () => ({ installId: 'install-1', sign: () => 'sig' }),
    answer: async () => { throw failure(); },
  });
  const { records, stop } = capture();
  await link.pollOnce({ wait: 0 }).catch(() => {});
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('relayed call not answered');
  expect(text).toContain('ETIMEDOUT');
  expect(text).not.toContain('made-up-secret-139');
});

test('a workflow run record that cannot be saved logs a code, never the error text', async () => {
  const run = { id: 'run-1', workspaceId: 'ws-1', windowId: 'win-1', status: 'running', results: {}, nodes: [] };
  const deps = { patchWindow: async () => {}, db: { query: async () => { throw failure(); } } };
  const { records, stop } = capture();
  await publish(run, deps);
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('run record not saved');
  expect(text).toContain('ETIMEDOUT');
  expect(text).not.toContain('made-up-secret-139');
});

test('no log call in the agent and worker folders passes the error text', () => {
  const roots = ['censaiOrchestrator', 'agentMemory', 'agent-wakeups', 'agent-registry', 'agent-card-runs', 'selfFix',
    'task-worker', 'agentNetwork', 'agentEndpoints', 'hostedAgents', 'cli-agents', 'workflows', 'tools'];
  const leaks = [];
  for (const root of roots) {
    const dir = path.resolve('server', root);
    for (const file of fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js'))) {
      fs.readFileSync(path.join(dir, file), 'utf8').split('\n').forEach((line, i) => {
        if (/\.(info|warn|error|debug)\(.*\b(err|error|e)\??\.message/.test(line)) leaks.push(`${root}/${file}:${i + 1}`);
      });
    }
  }
  expect(leaks).toEqual([]);
});
