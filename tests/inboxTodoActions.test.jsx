/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logToApp, installBrowserLog: () => {}, flushAppLog: () => {}, pendingAppLog: () => [], formatArgs: (a) => a.join(' ') }));
const { useWorkspaceStore } = await import('../src/lib/store.js');
const { goToTodo, isTodoHere, markTodoDone } = await import('../src/lib/todos/todoActions.js');
const { InboxDetail } = await import('../src/components/windows/inbox/InboxDetail.jsx');

const list = { id: 'w1', kind: 'todos', title: 'Launch week', x: 100, y: 100, w: 300, h: 300, items: [
  { id: 1, text: 'Photograph the loaves', done: false, assignee: 'user:7' },
  { id: 2, text: 'Print the menus', done: false, assignee: null },
] };
const todo = { boardId: 'board-1', windowId: 'w1', itemId: 1, text: 'Photograph the loaves' };

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'board-1', wins: [list], zoom: 1 });
  logToApp.mockClear();
});

describe('ticking off a to-do from the Inbox', () => {
  test('marks it done in its To-do window on this board, nothing else', () => {
    expect(isTodoHere(todo)).toBe(true);
    expect(markTodoDone(todo)).toEqual({ ok: true });
    const items = useWorkspaceStore.getState().wins.find((w) => w.id === 'w1').items;
    expect(items.map((it) => it.done)).toEqual([true, false]);
  });

  test('saves the tick for a list kept on the server too', async () => {
    useWorkspaceStore.setState({ wins: [{ ...list, artifactId: 'list-9' }] });
    const saveOperational = jest.fn(async () => ({}));
    expect(markTodoDone(todo, { saveOperational }).ok).toBe(true);
    expect(saveOperational).toHaveBeenCalledWith({ workspaceId: 'board-1', listArtifactId: 'list-9', itemArtifactId: 1, patch: { done: true } });
  });

  test('says why when the list is on another board or the to-do is gone', () => {
    expect(markTodoDone({ ...todo, boardId: 'board-2' })).toEqual({ ok: false, why: 'Open its board to tick it off there.' });
    expect(markTodoDone({ ...todo, itemId: 99 })).toEqual({ ok: false, why: 'This to-do is no longer in its list.' });
    expect(useWorkspaceStore.getState().wins[0].items[0].done).toBe(false);
  });

  test('Open centres its list here, or opens the board it is on', () => {
    expect(goToTodo(todo)).toBe(true);
    expect(useWorkspaceStore.getState().activeId).toBe('w1');
    const assign = jest.fn();
    expect(goToTodo({ ...todo, boardId: '5b7c1d2e-0000-4000-8000-000000000001' }, { assign })).toBe(true);
    expect(assign.mock.calls[0][0]).toContain('workspace=5b7c1d2e-0000-4000-8000-000000000001');
  });

  test('every Mark done and Open writes one log line with the board, list and outcome, never the to-do text', async () => {
    const line = { ...todo, repo: 'Bakery website', listTitle: 'Launch week' };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const logged = async (run) => {
      logToApp.mockClear();
      run();
      await settle();
      expect(logToApp).toHaveBeenCalledTimes(1);
      const [, message, options] = logToApp.mock.calls[0];
      expect(options).toEqual({ where: 'todos' });
      expect(message).not.toContain('Photograph the loaves');
      return message;
    };
    const where = (item = 1) => `(board "Bakery website", list "Launch week", item ${item})`;

    expect(await logged(() => markTodoDone(line))).toBe(`todos: Mark done from the Inbox worked ${where()}`);
    expect(await logged(() => markTodoDone(line))).toBe(`todos: Mark done from the Inbox worked: it was already ticked ${where()}`);
    expect(await logged(() => markTodoDone({ ...line, itemId: 99 }))).toBe(`todos: Mark done from the Inbox did not work: the to-do is no longer in its list ${where(99)}`);
    expect(await logged(() => markTodoDone({ ...line, boardId: 'board-2' }))).toBe(`todos: Mark done from the Inbox did not work: its list is not on the board you have open ${where()}`);

    useWorkspaceStore.setState({ wins: [{ ...list, artifactId: 'list-9' }] });
    expect(await logged(() => markTodoDone(line, { saveOperational: async () => ({}) }))).toBe(`todos: Mark done from the Inbox worked ${where()}`);
    useWorkspaceStore.setState({ wins: [{ ...list, artifactId: 'list-9' }] });
    const refused = async () => { throw new Error('HTTP 500'); };
    expect(await logged(() => markTodoDone(line, { saveOperational: refused }))).toBe(`todos: Mark done from the Inbox ticked it here, but the server did not save it: HTTP 500 ${where()}`);

    expect(await logged(() => goToTodo(line))).toBe(`todos: Open from the Inbox worked: its list is in view ${where()}`);
    const otherBoard = { ...line, boardId: '5b7c1d2e-0000-4000-8000-000000000001' };
    expect(await logged(() => goToTodo(otherBoard, { assign: () => {} }))).toBe(`todos: Open from the Inbox worked: opening its board ${where()}`);
    expect(await logged(() => goToTodo({ ...line, boardId: null }))).toBe(`todos: Open from the Inbox did not work: no link to its board ${where()}`);
  });
});

describe('the Inbox "Your to-do" line', () => {
  const item = { id: 'todo:my-todos:x', kind: 'todo', state: 'todo_for_you', tone: 'accent', title: 'Photograph the loaves', repo: 'Launch the bakery website before the weekend', stats: [{ label: 'List', value: 'Launch week' }, { label: 'Board', value: 'Launch the bakery website before the weekend' }], ...todo };

  test('has Mark done and Open next to Acknowledge, and shows the whole board name', () => {
    const onMarkDone = jest.fn(() => ({ ok: false, why: 'Open its board to tick it off there.' }));
    const onOpen = jest.fn();
    render(<InboxDetail item={item} onFix={() => {}} onOpen={onOpen} onAcknowledge={() => {}} onAnswer={() => {}} onMarkDone={onMarkDone} />);
    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledWith(item);
    fireEvent.click(screen.getByTestId('inbox-todo-done'));
    expect(onMarkDone).toHaveBeenCalledWith(item);
    expect(screen.getByRole('status').textContent).toBe('Open its board to tick it off there.');
    expect(screen.getByText('Launch the bakery website before the weekend', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Acknowledge/ })).toBeTruthy();
  });
});
