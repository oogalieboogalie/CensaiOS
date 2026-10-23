import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';
import { onLogRecord } from '../server/logger.js';

const SECRET = 'made-up-secret password=hunter2 /home/pat/private';

// A failing memory lookup makes filterToolsForAgent fail closed.
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: async () => { throw Object.assign(new Error(SECRET), { code: 'ECONNREFUSED' }); },
  getSubAgentById: async () => { throw Object.assign(new Error(SECRET), { code: 'ECONNREFUSED' }); },
}));

const { noteToolFailure } = await import('../server/tools/toolsLog.js');
const { filterToolsForAgent } = await import('../server/tools/rbac/checks.js');

function capture(fn) {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  return Promise.resolve(fn()).finally(() => stop()).then(() => {
    const consoleCalls = [...warn.mock.calls, ...error.mock.calls].filter((c) => !String(c[0]).includes('[tools]'));
    warn.mockRestore(); error.mockRestore();
    return { records, consoleCalls };
  });
}

test('a tool side step failure leaves one fixed tools line with the id and a code, never the error text', async () => {
  const { records } = await capture(() => noteToolFailure('provenance not recorded', { agentId: 'made-up-agent' }, Object.assign(new Error(SECRET), { code: 'EACCES' })));
  const tools = records.filter((r) => JSON.stringify(r).includes('provenance not recorded'));
  expect(tools).toHaveLength(1);
  expect(JSON.stringify(tools[0])).toContain('made-up-agent');
  expect(JSON.stringify(tools[0])).toContain('EACCES');
  expect(JSON.stringify(records)).not.toContain('hunter2');
});

test('permissions that fail closed leave a tools line and no raw console line', async () => {
  let tools;
  const { records } = await capture(async () => { tools = await filterToolsForAgent('made-up-agent', { workspaceId: 'made-up-ws' }); });
  expect(Array.isArray(tools)).toBe(true);
  const text = JSON.stringify(records);
  expect(text).toContain('permissions check failed closed');
  expect(text).toContain('ECONNREFUSED');
  expect(text).not.toContain('hunter2');
});

test('the seven agent tool files print nothing straight to the console', () => {
  const files = ['handlers/local.js', 'handlers/git/github.js', 'handlers/projects.js', 'handlers/subagents.js',
    'handlers/dispatch.js', 'rbac/checks.js', 'helpers.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve('server/tools', file), 'utf8');
    expect({ file, console: (source.match(/console\.(log|warn|error|info|debug)\(/g) || []).length }).toEqual({ file, console: 0 });
    expect(source).toContain('noteToolFailure');
  }
});
