/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { InboxWindow } from '../src/components/windows/inbox/index.jsx';
import { defaultRepo } from '../src/components/windows/inbox/useInbox.js';
import { logLine } from '../src/components/windows/inbox/InboxDetail.jsx';
import { clearBoardErrors, recordBoardError } from '../src/lib/inbox/boardErrors.js';

const stats = [{ label: 'Checks', value: 'lint failed', tone: 'danger' }, { label: 'Size', value: '2 files' }, { label: 'Branch', value: 'a → master' }];
const items = [
  { id: 'pr:o/r#7', kind: 'pr', repo: 'o/r', number: 7, url: 'https://github.com/o/r/pull/7', state: 'ci_failed', group: 'needs', tone: 'danger', title: 'Checks failed on #7', subtitle: 'Add retries', stats, failing: ['lint'], actions: ['fix_ci', 'open', 'acknowledge'], at: new Date().toISOString() },
  { id: 'pr:o/r#8', kind: 'pr', repo: 'o/r', number: 8, state: 'green', group: 'ready', tone: 'success', title: 'Docs tweak', subtitle: '#8 · checks passed', stats, actions: ['open', 'acknowledge'], at: new Date().toISOString() },
];

function mockFetch() {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (url.startsWith('/api/inbox?') || url === '/api/inbox') {
      return ok({ repo: 'o/r', github: { connected: true }, agents: { available: true }, items, groups: [{ id: 'needs', label: 'Needs you' }, { id: 'working', label: 'In progress' }, { id: 'ready', label: 'Ready' }, { id: 'done', label: 'Done' }], dock: { repos: [{ repo: 'acme/web', tasks: [{ taskId: 't1', cli: 'claudecode', title: 'Add retries to the webhook handler', state: 'running' }] }], tokens: [{ label: 'Claude Code', total: 2100000 }], days: 3 } });
    }
    if (url === '/api/github/desk/status') return ok({ connected: true, me: 'Alex' });
    if (url === '/api/inbox/fix-ci') return ok({ job: { id: 'j1', status: 'agent', text: 'An agent is finding out why the checks failed.', by: 'Alex', taskId: null } });
    if (url.startsWith('/api/github/desk/fix/')) return ok({ job: { id: 'j1', status: 'agent', text: 'An agent is finding out why the checks failed.' }, approvals: [] });
    return ok({});
  });
  return calls;
}

function Harness({ initial }) {
  const [win, setWin] = React.useState(initial);
  return <InboxWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(() => clearBoardErrors());

describe('Inbox window', () => {
  test('groups what needs you first and shows plain numbers for the selected item', async () => {
    mockFetch();
    render(<Harness initial={{ id: 'w', inboxRepo: 'o/r' }} />);
    expect((await screen.findAllByText('Checks failed on #7')).length).toBeGreaterThan(0);
    expect(screen.getByText('Needs you')).toBeTruthy();
    expect(screen.getByText('lint failed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Have an agent fix it/ })).toBeTruthy();
  });

  test('one click hands red checks to an agent and shows who started it', async () => {
    const calls = mockFetch();
    render(<Harness initial={{ id: 'w', inboxRepo: 'o/r' }} />);
    const fix = await screen.findByRole('button', { name: /Have an agent fix it/ });
    await act(async () => { fireEvent.click(fix); });
    expect(calls.find((c) => c.url === '/api/inbox/fix-ci').body).toEqual({ repo: 'o/r', number: 7 });
    expect((await screen.findAllByText(/finding out why the checks failed/)).length).toBeGreaterThan(0);
  });

  test('E acknowledges, the toast offers undo, U brings it back', async () => {
    mockFetch();
    render(<Harness initial={{ id: 'w', inboxRepo: 'o/r' }} />);
    await screen.findAllByText('Checks failed on #7');
    const root = screen.getByTestId('inbox-window');
    await act(async () => { fireEvent.keyDown(root, { key: 'e' }); });
    expect(screen.getByRole('status').textContent).toMatch(/Acknowledged/);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await act(async () => { fireEvent.keyDown(root, { key: 'u' }); });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('errors caught on this board show up as their own item', async () => {
    mockFetch();
    recordBoardError('TypeError: price is undefined');
    recordBoardError('TypeError: price is undefined');
    render(<Harness initial={{ id: 'w', inboxRepo: 'o/r' }} />);
    expect((await screen.findAllByText('TypeError: price is undefined')).length).toBeGreaterThan(0);
  });

  test('the dock shows what agents are doing and their token use', async () => {
    mockFetch();
    render(<Harness initial={{ id: 'w', inboxRepo: 'o/r' }} />);
    await screen.findAllByText('Checks failed on #7');
    fireEvent.mouseEnter(document.querySelector('.hb-inbox-dock'));
    expect(screen.getByText('Add retries to the webhook handler')).toBeTruthy();
    expect(screen.getByText(/Claude Code 2\.1M tokens in 3 days/)).toBeTruthy();
  });

  test('watches the GitHub window\'s repo when none is picked; log lines read like a terminal', () => {
    expect(defaultRepo({}, [{ kind: 'githubConsole', state: { repo: 'a/b' } }])).toBe('a/b');
    expect(defaultRepo({ inboxRepo: 'x/y' }, [])).toBe('x/y');
    expect(logLine({ kind: 'command', command: 'npm test' })).toBe('$ npm test');
    expect(logLine({ kind: 'thinking', text: 'hmm' })).toBe('');
  });
});
