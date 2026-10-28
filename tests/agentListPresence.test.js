// Agent list presence: every agent gets a badge, a "doing" line and where it
// runs, built only from real activity on the board and the server.
import { buildAgentList, elapsed, filterAgentRows } from '../src/lib/agentList/presence.js';
import { chatHost, networkHost, windowHost } from '../src/lib/agentList/hosts.js';
import { runEnded, runStarted, runTool } from '../src/lib/weewoo/agentRun.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const MIN = 60 * 1000;
const chat = (id, agentId, extra = {}) => ({ id, kind: 'chat', agentId, x: 0, y: 0, w: 400, h: 300, ...extra });
const AGENTS = [
  { id: 'atlas', name: 'Atlas', role: 'Backend', model_provider: 'anthropic', model_name: 'claude-x' },
  { id: 'nexus', name: 'Nexus', role: 'Databases', model_provider: 'ollama', model_name: 'qwen3' },
  { id: 'echo', name: 'Echo', role: 'Business brain' },
  { id: 'genesis', name: 'Genesis', role: 'UI/UX' },
];
const row = (list, key) => list.rows.find((r) => r.key === key);

test('a chat agent working for someone says who, for how long, and where it runs', () => {
  const run = runStarted(null, { prompt: 'plan the release', by: 'Sam', now: NOW - 3 * MIN });
  const list = buildAgentList({ wins: [chat('w-atlas', 'atlas', { agentRun: { ...run, at: NOW - MIN } })], agents: AGENTS, now: NOW });
  const atlas = row(list, 'agent:atlas');
  expect(atlas).toMatchObject({ status: 'busy', line: 'Chatting with Sam', windowId: 'w-atlas', onBoard: true });
  expect(elapsed(atlas.since, NOW)).toBe('3m');
  expect(atlas.host).toEqual({ id: 'cloud', label: 'Runs on a cloud model (Anthropic, claude-x)' });
  expect(list.groups[0]).toMatchObject({ id: 'busy' });
  expect(list.groups[0].rows.map((r) => r.key)).toEqual(['agent:atlas']);
});

test('a tool call shows the tool; an idle window is online, then away after a while', () => {
  const tool = runTool(runStarted(null, { prompt: 'x', now: NOW - 2 * MIN }), { tool: 'web_search', now: NOW - MIN });
  const done = runEnded(runStarted(null, { prompt: 'y', now: NOW - 5 * MIN }), { now: NOW - 4 * MIN });
  const old = runEnded(runStarted(null, { prompt: 'z', now: NOW - 90 * MIN }), { now: NOW - 80 * MIN });
  const list = buildAgentList({
    wins: [chat('w-atlas', 'atlas', { agentRun: tool }), chat('w-nexus', 'nexus', { agentRun: done }), chat('w-echo', 'echo', { agentRun: old })],
    agents: AGENTS, now: NOW,
  });
  expect(row(list, 'agent:atlas')).toMatchObject({ status: 'busy', line: 'Using web_search' });
  expect(row(list, 'agent:nexus')).toMatchObject({ status: 'online', line: 'Answered' });
  expect(row(list, 'agent:nexus').host.id).toBe('local');
  expect(row(list, 'agent:echo')).toMatchObject({ status: 'away', line: 'Idle' });
  expect(row(list, 'agent:genesis')).toMatchObject({ status: 'offline', line: 'Not on this board', onBoard: false });
});

test('the server fills in agents that are not on the board', () => {
  const server = {
    chats: [
      { agentId: 'echo', at: new Date(NOW - 4 * MIN).toISOString(), withName: 'Alma' },
      { agentId: 'genesis', at: new Date(NOW - 3 * 60 * MIN).toISOString(), withName: 'Sam' },
    ],
    tasks: [
      { id: 't1', agentId: 'nexus', title: 'Check the backups', status: 'in_progress', helper: 'Scout', startedAt: new Date(NOW - 12 * MIN).toISOString() },
      { id: 't2', agentId: 'atlas', title: 'Later', status: 'queued' },
    ],
    network: [
      { cardId: 'ext:censai:abc', name: 'Sam\'s Atlas', source: 'censai', lastRequest: { status: 'waiting', task: 'Q', at: new Date(NOW - 2 * MIN).toISOString() } },
      { cardId: 'ext:a2a:def', name: 'Weather bot', source: 'a2a', lastRequest: null },
      { cardId: 'ext:censai:ghi', name: 'Ines\'s Nexus', source: 'censai', lastRequest: { status: 'working', task: 'Index the orders table', at: new Date(NOW - MIN).toISOString() } },
    ],
  };
  const list = buildAgentList({ wins: [], agents: AGENTS, server, now: NOW });
  expect(row(list, 'agent:echo')).toMatchObject({ status: 'online', line: 'Chatted with Alma' });
  expect(row(list, 'agent:genesis')).toMatchObject({ status: 'offline', line: 'Last chat 3h ago with Sam' });
  expect(row(list, 'agent:nexus')).toMatchObject({ status: 'busy', line: 'Scout is on: Check the backups' });
  expect(elapsed(row(list, 'agent:nexus').since, NOW)).toBe('12m');
  expect(row(list, 'agent:atlas')).toMatchObject({ status: 'offline', line: 'Not on this board · 1 task in line' });
  expect(row(list, 'card:ext:censai:abc')).toMatchObject({ status: 'away', host: { id: 'remote' } });
  expect(row(list, 'card:ext:a2a:def')).toMatchObject({ status: 'remote', line: 'Answers when its computer is on', host: { id: 'web' } });
  expect(row(list, 'card:ext:censai:ghi')).toMatchObject({ status: 'busy', line: 'Answering: Index the orders table' });
  expect(list.counts).toEqual({ busy: 2, online: 1, away: 1, remote: 1, offline: 2 });
});

test('coding agents, modules and help cards show what they are doing', () => {
  const wins = [
    { id: 'w-cc', kind: 'agentConsole', cli: 'claudecode', cliStatus: 'running', cliTask: 'Run the tests', cliStatusAt: NOW - 12 * MIN },
    { id: 'w-mod', kind: 'module', status: 'ready', title: 'Tip calculator' },
    chat('w-echo', 'echo'),
    { id: 'card-1', kind: 'agentHelp', status: 'working', toWindowId: 'w-echo', fromLabel: 'Atlas', task: 'Price this', createdAt: new Date(NOW - 2 * MIN).toISOString(), updatedAt: new Date(NOW - MIN).toISOString() },
    { id: 'w-cx', kind: 'agentConsole', cli: 'codex', cliStatus: 'needs_approval', cliStatusAt: NOW - MIN },
  ];
  const list = buildAgentList({ wins, agents: AGENTS, now: NOW });
  expect(row(list, 'win:w-cc')).toMatchObject({ name: 'Claude Code', status: 'busy', line: 'Coding: Run the tests', host: { id: 'local' } });
  expect(elapsed(row(list, 'win:w-cc').since, NOW)).toBe('12m');
  expect(row(list, 'win:w-cx')).toMatchObject({ status: 'waiting', line: 'Waiting for a person to allow a step' });
  expect(row(list, 'win:w-mod')).toMatchObject({ status: 'online', host: windowHost('module') });
  expect(row(list, 'agent:echo')).toMatchObject({ status: 'busy', line: 'Helping Atlas' });
  expect(list.rows.some((r) => r.windowId === 'card-1')).toBe(false);
});

test('search matches name, job, doing line and where it runs', () => {
  const list = buildAgentList({ wins: [chat('w-atlas', 'atlas')], agents: AGENTS, now: NOW });
  expect(filterAgentRows(list.rows, 'datab').map((r) => r.name)).toEqual(['Nexus']);
  expect(filterAgentRows(list.rows, 'cloud').map((r) => r.name)).toEqual(['Atlas']);
  expect(filterAgentRows(list.rows, '')).toHaveLength(4);
});

test('hosts read in plain words', () => {
  expect(chatHost({}).label).toBe('Runs on the board\'s default model');
  expect(chatHost({ model_provider: 'lmstudio' }).id).toBe('local');
  expect(networkHost('n8n')).toEqual({ id: 'web', label: 'Runs on the web (an n8n chat)' });
  expect(elapsed(NOW - 30 * 1000, NOW)).toBe('now');
  expect(elapsed(NOW - 3 * 24 * 60 * MIN, NOW)).toBe('3d');
  expect(elapsed(null, NOW)).toBe('');
});

test('runStarted keeps who asked, short', () => {
  expect(runStarted(null, { prompt: 'p', by: '  Sam  ' }).by).toBe('Sam');
  expect(runStarted(null, { prompt: 'p' }).by).toBe(null);
});
