// To-do Assign menu: "Me", coding agents, and the "For you" reminder that
// lists to-dos assigned to you on every board (bottom bar + Inbox).
import { jest } from '@jest/globals';
import { CODING_AGENTS, codingAgentAssignee, openTodosFor, parseAssignee, personAssignee } from '../src/lib/todos/assignees.js';
import { CLI_IDS } from '../server/cli-agents/adapters/index.js';
import { listMyTodos } from '../server/todos/mine.js';
import { myTodoReport, registerMyTodosSource, setMyTodosLister } from '../server/inbox/myTodosSource.js';
import { listReports, resetInboxSources } from '../server/inbox/sources.js';
import { buildInbox } from '../server/inbox/collect.js';
import { codingAgentPrompt, startCodingAgent } from '../src/components/todos/startCodingAgent.js';

afterEach(() => resetInboxSources());

const list = (items, extra = {}) => ({ id: 'w1', kind: 'todos', title: 'Launch week', items, ...extra });

describe('who a to-do can be assigned to', () => {
  test('the Assign menu offers every coding agent the Agent Console can run', () => {
    expect(CODING_AGENTS.map((a) => a.id)).toEqual([...CLI_IDS]);
  });

  test('assignee values read back as a person, a coding agent or a board agent', () => {
    expect(parseAssignee(personAssignee(7))).toEqual({ type: 'person', id: '7' });
    expect(parseAssignee(codingAgentAssignee('claudecode'))).toEqual({ type: 'cli', id: 'claudecode' });
    expect(parseAssignee('architect')).toEqual({ type: 'agent', id: 'architect' });
    expect(parseAssignee(null)).toBeNull();
    expect(parseAssignee('cli:not-a-cli')).toBeNull();
    expect(codingAgentAssignee('not-a-cli')).toBeNull();
    expect(personAssignee(null)).toBeNull();
  });

  test('only open to-dos assigned to me count, from To-do windows only', () => {
    const wins = [
      list([
        { id: 1, text: 'Call the print shop', assignee: 'user:7' },
        { id: 2, text: 'Order boxes', assignee: 'user:7', done: true },
        { id: 3, text: 'Fix the link', assignee: 'cli:claudecode' },
        { id: 4, text: 'Someone else', assignee: 'user:8' },
        { id: 5, text: '', assignee: 'user:7' },
      ]),
      { id: 'w2', kind: 'idea', items: [{ id: 1, text: 'not a to-do', assignee: 'user:7' }] },
    ];
    expect(openTodosFor(wins, 7)).toEqual([
      { windowId: 'w1', listTitle: 'Launch week', itemId: 1, text: 'Call the print shop' },
      { windowId: 'w1', listTitle: 'Launch week', itemId: 5, text: 'Untitled task' },
    ]);
    expect(openTodosFor(wins, null)).toEqual([]);
  });
});

describe('to-dos assigned to me on every board', () => {
  test('reads To-do windows from the boards I belong to and keeps only mine', async () => {
    const db = { query: jest.fn(async () => ({ rows: [
      { board_id: 'b1', board_name: 'Bakery website', updated_at: '2026-10-18T10:00:00Z', win: list([{ id: 1, text: 'Photograph the loaves', assignee: 'user:7' }, { id: 2, text: 'Not mine', assignee: 'genesis' }]) },
      { board_id: 'b2', board_name: null, updated_at: '2026-10-17T10:00:00Z', win: list([{ id: 9, text: 'Draft the newsletter', assignee: 'user:7' }], { id: 'w9', title: '' }) },
    ] })) };
    const todos = await listMyTodos(db, { userId: 7 });
    expect(db.query.mock.calls[0][1]).toEqual([7, 'homebase.workspace.v1']);
    expect(db.query.mock.calls[0][0]).toMatch(/wm\.user_id = \$1/);
    expect(todos).toEqual([
      { windowId: 'w1', listTitle: 'Launch week', itemId: 1, text: 'Photograph the loaves', boardId: 'b1', boardName: 'Bakery website', updatedAt: '2026-10-18T10:00:00.000Z' },
      { windowId: 'w9', listTitle: 'To-do List', itemId: 9, text: 'Draft the newsletter', boardId: 'b2', boardName: 'Untitled board', updatedAt: '2026-10-17T10:00:00.000Z' },
    ]);
    expect(await listMyTodos(db, { userId: null })).toEqual([]);
  });

  test('each one is a "Your to-do" line in the Inbox under Needs you', async () => {
    setMyTodosLister(async ({ userId }) => (userId === 7 ? [
      { boardId: 'b1', boardName: 'Bakery website', windowId: 'w1', listTitle: 'Menu refresh', itemId: 1, text: 'Photograph the loaves', updatedAt: '2026-10-18T10:00:00.000Z' },
    ] : []));
    registerMyTodosSource();
    const { reports } = await listReports({ userId: 7 });
    const [item] = buildInbox({ reports }).items;
    expect(item).toMatchObject({ kind: 'todo', state: 'todo_for_you', group: 'needs', title: 'Photograph the loaves', repo: 'Bakery website', fixable: false });
    expect(item.stats).toEqual([{ label: 'List', value: 'Menu refresh' }, { label: 'Board', value: 'Bakery website' }]);
    expect(item).toMatchObject({ boardId: 'b1', windowId: 'w1', listTitle: 'Menu refresh', itemId: 1, actions: ['mark_done', 'open', 'acknowledge'] });
    expect((await listReports({ userId: null })).reports).toEqual([]);
    expect(myTodoReport({ boardId: 'b', windowId: 'w', itemId: 3, text: 'x', listTitle: 'L', boardName: 'B', updatedAt: 'now' }).id).toBe('b:w:3');
  });
});

describe('sending a to-do to a coding agent', () => {
  const item = { id: 3, text: 'Fix the broken link on the pricing page', assignee: 'cli:claudecode' };

  test('starts the agent headless in the open project and notes it on the to-do', async () => {
    const api = { start: jest.fn(async () => ({ task: { id: 'task-1' } })) };
    const saved = await startCodingAgent({ item, folder: '/demo/pricing-site', listTitle: 'Launch week', api });
    expect(api.start).toHaveBeenCalledWith({ cli: 'claudecode', folder: '/demo/pricing-site', prompt: codingAgentPrompt(item, 'Launch week') });
    expect(codingAgentPrompt(item, 'Launch week')).toContain('Fix the broken link on the pricing page');
    expect(saved).toMatchObject({ cliTaskId: 'task-1', implementationStatus: 'cli_started', implementationTarget: 'cli:claudecode' });
    expect(saved.handoffWarning).toMatch(/Claude Code is working on it/);
  });

  test('leaves other to-dos to the usual hand-off and says plainly why a start failed', async () => {
    expect(await startCodingAgent({ item: { ...item, assignee: 'architect' }, folder: '/demo', api: {} })).toBeNull();
    await expect(startCodingAgent({ item, folder: '', api: {} })).rejects.toThrow('Open a local project first');
    await expect(startCodingAgent({ item, folder: '/demo', api: { start: async () => ({}) } })).rejects.toThrow('did not say which task');
    const ownerOnly = { start: async () => { throw Object.assign(new Error('nope'), { status: 403 }); } };
    await expect(startCodingAgent({ item, folder: '/demo', api: ownerOnly })).rejects.toThrow("Claude Code did not start. Only this computer's owner account can start Claude Code.");
  });
});
