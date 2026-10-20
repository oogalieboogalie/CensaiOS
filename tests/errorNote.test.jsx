/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ErrorNote } from '../src/components/ErrorNote.jsx';
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { apiError, buildErrorSnippet, fetchLogLines, plainWords, sendErrorToClaude } from '../src/lib/errorReport.js';
import { useWorkspaceStore } from '../src/lib/store.js';

const ownerOnly = () => apiError(
  { status: 403 },
  { error: "Only this computer's owner can do this.", reason: 'owner-only', code: 'computer_owner_only' },
  'Failed to create handoff',
  { method: 'post', path: '/api/project-handoffs?x=1' },
);

describe('errorReport', () => {
  test('an owner-only refusal reads in plain words and keeps what was asked', () => {
    const error = ownerOnly();
    expect(plainWords(error)).toMatch(/owner account, and you're signed in with a different account/);
    expect(error).toMatchObject({ status: 403, method: 'POST', path: '/api/project-handoffs', reason: 'owner-only' });
  });

  test('plain words for sign-out, network and plain strings', () => {
    expect(plainWords(apiError({ status: 401 }, {}, 'x'))).toMatch(/signed out/);
    expect(plainWords(new TypeError('Failed to fetch'))).toMatch(/couldn't be reached/);
    expect(plainWords('Just a line')).toBe('Just a line');
    expect(plainWords(apiError({ status: 500 }, { error: 'database unavailable' }, 'x'))).toBe('database unavailable');
  });

  test('the snippet carries the request, place and last steps, scrubbed', () => {
    const snippet = buildErrorSnippet(ownerOnly(), {
      where: 'To-do List window',
      actions: [
        { at: Date.UTC(2026, 9, 17, 16, 47, 20), type: 'click', label: 'Hand off', windowKind: 'todos' },
        { at: Date.UTC(2026, 9, 17, 16, 47, 27), type: 'request', label: 'POST /api/project-handoffs 403 sk-ant-abcdefghijklmnop alma@example.com' },
      ],
    });
    expect(snippet).toContain('Request: POST /api/project-handoffs -> 403 (owner-only)');
    expect(snippet).toContain('Where: To-do List window');
    expect(snippet).toContain('16:47:20 click Hand off [todos]');
    expect(snippet).not.toMatch(/sk-ant-|alma@example\.com/);
    expect(snippet).toContain('[key]');
    expect(snippet).toContain('[email]');
  });

  test('Send to Claude opens a Censai chat with the snippet already sent', () => {
    const spawnAt = jest.fn();
    const seen = [];
    const onBoardError = (e) => seen.push(e.detail);
    window.addEventListener('censai:board-error', onBoardError);
    const snippet = sendErrorToClaude(ownerOnly(), { where: 'To-do List window', store: { getState: () => ({ spawnAt }) } });
    window.removeEventListener('censai:board-error', onBoardError);
    expect(spawnAt).toHaveBeenCalledWith('chat', expect.objectContaining({ agentId: 'censai', autoSend: true }));
    const props = spawnAt.mock.calls[0][1];
    expect(props.msgs[0]).toMatchObject({ from: 'me' });
    expect(props.msgs[0].text).toContain(snippet);
    expect(seen[0].detail).toBe(snippet);
  });
});

describe('ErrorNote', () => {
  test('shows the plain line, opens Details, and sends to Claude', () => {
    const spawnAt = jest.spyOn(useWorkspaceStore.getState(), 'spawnAt');
    render(<ErrorNote error={ownerOnly()} where="To-do List window" />);
    expect(screen.getByRole('alert').textContent).toMatch(/owner account/);
    expect(screen.queryByTestId('error-note-log')).toBeNull();
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByTestId('error-note-log').textContent).toContain('POST /api/project-handoffs -> 403');
    const before = useWorkspaceStore.getState().wins.length;
    fireEvent.click(screen.getByText('Send to Claude'));
    const wins = useWorkspaceStore.getState().wins;
    expect(wins.length).toBe(before + 1);
    expect(wins[wins.length - 1]).toMatchObject({ agentId: 'censai', autoSend: true });
    expect(screen.getByText('Sent to Claude')).toBeTruthy();
    spawnAt.mockRestore();
  });

  test('renders nothing without an error', () => {
    const { container } = render(<ErrorNote error={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('TodosWindow hand-off refused for a non-owner account', () => {
  test('shows the error panel instead of a bare red line', async () => {
    act(() => { useWorkspaceStore.getState().setWorkspaceId('workspace-test'); });
    global.fetch = jest.fn(async (url) => (String(url).includes('/api/project-handoffs')
      ? { ok: false, status: 403, json: async () => ({ error: "Only this computer's owner can do this.", reason: 'owner-only', code: 'computer_owner_only' }) }
      : { ok: false, status: 404, json: async () => ({}) }));
    render(<TodosWindow
      win={{ id: 'todos-2', kind: 'todos', title: 'To-do List', items: [{ id: 't1', text: 'Vantage needs a landing page', done: false, assignee: 'censai' }] }}
      onUpdate={() => {}}
      currentProject={{ path: '/workspace/projects/vantage' }}
    />);
    fireEvent.click(screen.getByTitle('Create project handoff'));
    await waitFor(() => expect(screen.getByTestId('error-note')).toBeTruthy());
    expect(screen.getByTestId('error-note').textContent).toMatch(/owner account/);
    expect(screen.getByText('Send to Claude')).toBeTruthy();
  });
});

describe('the app log in the snippet', () => {
  test('recent warnings and errors from the log go under the error', () => {
    const snippet = buildErrorSnippet('Save failed', { actions: [], logLines: ['2026-10-17 22:59:01 ERROR [todos] insert failed for alma@example.com'] });
    expect(snippet).toContain('censaiOS log (warnings and errors, last 10 minutes):');
    expect(snippet).toContain('ERROR [todos] insert failed for [email]');
  });

  test('fetchLogLines asks for warnings and gives up quietly', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ lines: ['a', 'b'] }) }));
    expect(await fetchLogLines({ fetcher })).toEqual(['a', 'b']);
    expect(fetcher.mock.calls[0][0]).toBe('/api/logs/recent?level=warn&minutes=10&lines=15');
    expect(await fetchLogLines({ fetcher: async () => ({ ok: false }) })).toEqual([]);
    expect(await fetchLogLines({ fetcher: async () => { throw new Error('offline'); } })).toEqual([]);
  });
});
