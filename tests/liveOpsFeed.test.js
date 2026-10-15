// Live Operations feed: board windows and server lists become one plain-words list.
import { buildFeed, money, when } from '../src/lib/liveOps/feed.js';
import { plainReason } from '../src/lib/liveOps/plainReason.js';

const NOW = Date.parse('2026-10-14T15:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();

const wins = [
  { id: 'chat-1', kind: 'chat', title: 'Atlas', agentRun: { state: 'tool', tool: 'web_search', task: 'Find three venues', at: NOW - 30000, startedAt: NOW - 60000 } },
  { id: 'chat-2', kind: 'chat', title: 'Nova', agentRun: { state: 'error', at: NOW - 5 * 60000, log: [{ at: NOW - 5 * 60000, kind: 'error', text: '401 invalid x-api-key' }] } },
  { id: 'wf-1', kind: 'workflow', title: 'Morning brief', graph: { nodes: [{ id: 'a', title: 'Research' }, { id: 'b', title: 'Review it' }] },
    run: { id: 'run-1', status: 'awaiting_review', startedAt: ago(3), nodes: { a: { status: 'done' }, b: { status: 'waiting' } } } },
  { id: 'arena-1', kind: 'modelArena', title: 'Model arena', lastRun: { at: ago(20), lanes: [{ provider: 'ollama', model: 'llama3' }], results: [{ status: 'done', usage: { input: 10, output: 20 } }] } },
  { id: 'help-1', kind: 'agentHelp', fromLabel: 'Atlas', toLabel: 'Scout', status: 'working', task: 'Check the lease', updatedAt: ago(1) },
];

const server = {
  tasks: [{ id: 't1', title: 'Clean the CRM', status: 'failed', error: 'Request timed out after 60s', assignee_id: 'sa1', completed_at: ago(40) }],
  schedules: [{ id: 's1', taskText: 'Weekly report', status: 'active', nextRunAt: new Date(NOW + 2 * 3600000).toISOString(), agentName: 'Atlas' }],
  cliTasks: [{ id: 'c1', title: 'Fix login', status: 'done', cliLabel: 'Claude Code', costUsd: 0.42, createdAt: NOW - 3600000, finishedAt: NOW - 600000, summary: 'Fixed it' }],
  devServers: [{ name: 'censai-dev-x', folder: '/home/alex/site', state: 'running', url: 'http://localhost:5173' }],
  liveOps: {
    workflowRuns: [
      { id: 'run-1', windowId: 'wf-1', status: 'awaiting_review', startedAt: ago(3) },
      { id: 'run-0', windowId: 'wf-1', status: 'failed', error: 'Research: fetch failed', startedAt: ago(90), finishedAt: ago(89) },
    ],
    workflowTriggers: [{ windowId: 'wf-1', mode: 'schedule', everyMinutes: 60, nextRunAt: new Date(NOW + 30 * 60000).toISOString() }],
    terminals: [
      { id: 'term-1', cli: 'claudecode', label: 'Claude Code', owner: 'Sam', ownerUserId: '8', lastInputAt: ago(3), lastActivityAt: ago(0.2) },
      { id: 'term-1', cli: 'claudecode', label: 'Claude Code', owner: 'Alex', ownerUserId: '7', lastActivityAt: ago(0.1) },
    ],
  },
  jules: [],
};

test('everything on the board and the server lands in one list, what needs a person first', () => {
  const feed = buildFeed({ wins, server, agentName: () => 'Scribe', now: NOW });
  expect(feed.items[0]).toMatchObject({ state: 'needs_you', title: 'Morning brief', detail: 'Waiting for a person to review "Review it"' });
  expect(feed.counts).toMatchObject({ needs_you: 1, failed: 3, running: 4, upcoming: 2, done: 2 });
  const titles = feed.items.map((i) => i.title);
  expect(titles).toEqual(expect.arrayContaining(['Atlas', 'Atlas asked Scout', 'site dev server', 'Claude Code (Sam)', 'Fix login', 'Weekly report']));
  // The window's own run is not counted twice from the server history.
  expect(feed.items.filter((i) => i.runId === 'run-1')).toHaveLength(1);
});

test('failures read in plain words, with the exact error one click away', () => {
  const feed = buildFeed({ wins, server, now: NOW });
  const nova = feed.items.find((i) => i.title === 'Nova');
  expect(nova).toMatchObject({ state: 'failed', detail: 'The AI provider turned down the key. Check the key in Settings, Keys.', raw: '401 invalid x-api-key' });
  expect(feed.items.find((i) => i.title === 'Clean the CRM').detail).toBe('It took too long and was stopped.');
  expect(feed.items.find((i) => i.runId === 'run-0').detail).toMatch(/could not reach the service/i);
});

test('spent today adds up the runs that report a price', () => {
  const feed = buildFeed({ wins, server, now: NOW });
  expect(feed.spentToday).toEqual({ usd: 0.42, priced: 2 });
  expect(money(0.42)).toBe('$0.42');
  expect(money(0)).toBe('free');
  expect(money(0.0034)).toBe('$0.0034');
});

test('the Agent Console is counted once: from the server when it answers, else from its windows', () => {
  const board = [{ id: 'ac', kind: 'agentConsole', cliStatus: 'needs_approval', cliStatusAt: NOW, cliTask: 'Add tests' }];
  expect(buildFeed({ wins: board, server: { cliTasks: [] }, now: NOW }).counts.needs_you).toBe(0);
  expect(buildFeed({ wins: board, server: { cliTasks: null }, now: NOW }).counts.needs_you).toBe(1);
});

test('an abandoned run, a quiet terminal and one only on screen do not show as running', () => {
  const stale = [{ id: 'c', kind: 'chat', agentRun: { state: 'thinking', at: NOW - 3600000 } }];
  const quiet = { liveOps: { terminals: [{ id: 't', label: 'Terminal', lastActivityAt: ago(30) }] } };
  expect(buildFeed({ wins: stale, server: quiet, now: NOW }).counts.running).toBe(0);
});

test('a race in progress shows as running for everyone', () => {
  const racing = [{ id: 'a', kind: 'modelArena', racing: { at: ago(1), lanes: 3 } }];
  expect(buildFeed({ wins: racing, now: NOW }).items[0]).toMatchObject({ state: 'running', detail: 'Racing 3 models' });
});

test('times read like a person would say them', () => {
  expect(when(NOW - 10000, NOW)).toBe('just now');
  expect(when(NOW - 5 * 60000, NOW)).toBe('5 min ago');
  expect(when(NOW + 2 * 3600000, NOW)).toBe('in 2 h');
  expect(plainReason('').plain).toMatch(/gave no reason/);
  expect(plainReason('Scout can\'t use "Search" on this board yet.').plain).toBe('Scout can\'t use "Search" on this board yet.');
});

test('a Scheduler row reads the same plain words as the Scheduler window', () => {
  const row = { id: 's2', taskText: 'Call new leads', status: 'active', scheduled_time: '09:00 AM', scheduled_date: '2026-10-15', repeat_enabled: true, repeat_freq: 'weekly', repeat_days: { m: true, t: true, w: true, th: true, f: true }, agentName: 'Atlas' };
  const item = buildFeed({ server: { schedules: [row] }, now: NOW }).items[0];
  expect(item.state).toBe('upcoming');
  expect(item.detail).toMatch(/, by Atlas$/);
  expect(item.detail.toLowerCase()).toMatch(/weekday|9/);
});
