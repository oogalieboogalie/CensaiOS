/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { GithubConsoleWindow } from '../src/components/GithubConsoleWindow.jsx';
import { InboxDetail } from '../src/components/windows/inbox/InboxDetail.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

// A made-up fix job's agent asks to print a made-up shop's .env on this
// computer. The merge desk's card on the shared board keeps a teammate's
// words (the request's title alone); this computer's owner's own screen
// shows the whole request, and the card opens the agent's task. All made up.

const ENV = '/made-up/home/made-up-shop/.env';
const BOARD = [{ id: 'p1', title: 'Run a command', detail: '' }];
const WHOLE = [{ id: 'p1', title: 'Run a command', detail: `cat ${ENV}` }];
const pr = { number: 8, title: 'PR 8', url: 'https://github.com/o/r/pull/8', author: 'pat', draft: false, summary: '', checks: { state: 'passed', text: 'Checks passed', failing: [] }, conflicts: true, mergeKnown: true, green: false };

function mockFetch({ owner }) {
  global.fetch = jest.fn(async (url) => {
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (url === '/api/github/desk/status') return ok({ connected: true, source: 'byok', me: owner ? 'Pat' : 'Sam' });
    if (url.startsWith('/api/github/desk?')) return ok({ repo: 'o/r', prs: [pr], recent: [], fetchedAt: new Date().toISOString() });
    if (url === '/api/github/desk/fix') return ok({ job: { id: 'j1', status: 'agent', text: 'An agent is merging master in.', by: 'Pat', taskId: 't1' } });
    if (url === '/api/github/desk/fix/j1') {
      return ok({ job: { id: 'j1', status: 'needs_approval', text: 'The agent wants your OK to continue.', by: 'Pat', taskId: 't1' }, approvals: BOARD, ...(owner ? { whole: WHOLE } : {}) });
    }
    return ok({});
  });
}

// The window writes shared fields through onUpdate; feed them back like the board does, and keep every write.
function Harness({ writes }) {
  const [win, setWin] = React.useState({ id: 'w', state: { repo: 'o/r' } });
  return <GithubConsoleWindow win={win} onUpdate={(patch) => { writes.push(patch); setWin((w) => ({ ...w, ...patch })); }} />;
}

async function startFix(writes) {
  render(<Harness writes={writes} />);
  const fix = await screen.findByRole('button', { name: 'Fix conflicts' });
  await act(async () => { fireEvent.click(fix); });
  let ask = null;
  await waitFor(() => { ask = document.querySelector('.hb-gh-approval'); expect(ask).toBeTruthy(); }, { timeout: 5000 });
  return ask;
}

describe("the merge desk's Fix conflicts card", () => {
  test("the owner's screen shows the request whole; the window on the board keeps a teammate's words", async () => {
    mockFetch({ owner: true });
    const writes = [];
    const ask = await startFix(writes);
    await waitFor(() => expect(ask.textContent).toContain(`Run a command: cat ${ENV}`), { timeout: 5000 });
    const shared = JSON.stringify(writes);
    expect(shared).toContain('"approvals":[{"id":"p1","title":"Run a command","detail":""}]');
    expect(shared).not.toContain('made-up-shop');
  });

  test("a teammate's screen shows the board's words", async () => {
    mockFetch({ owner: false });
    const writes = [];
    const ask = await startFix(writes);
    await waitFor(() => expect(ask.textContent).toContain('Run a command'), { timeout: 5000 });
    expect(ask.textContent).not.toContain('made-up-shop');
  });

  test("Open in Agent Console opens the agent's own task", async () => {
    const real = useWorkspaceStore.getState().spawnAt;
    const spawnAt = jest.fn();
    useWorkspaceStore.setState({ spawnAt });
    try {
      mockFetch({ owner: true });
      await startFix([]);
      fireEvent.click(screen.getByRole('button', { name: 'Open in Agent Console' }));
      expect(spawnAt).toHaveBeenCalledWith('agentConsole', { taskId: 't1', title: 'Agent Console' });
    } finally {
      useWorkspaceStore.setState({ spawnAt: real });
    }
  });
});

describe("the Inbox's agent log", () => {
  test('a waiting request shows its detail as this screen asked for it', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({
      task: { id: 't1', status: 'needs_approval', cliLabel: 'Claude Code' }, rev: 1, items: [],
      permissions: [{ id: 'p1', status: 'pending', title: 'Run a command', detail: `cat ${ENV}` }],
    }) }));
    const item = { id: 'pr-8', kind: 'pr', title: 'Merge conflict on #8', state: 'conflict', tone: 'warning', stats: [], actions: ['fix_conflicts'] };
    render(<InboxDetail item={item} act={{ state: 'fixing', by: 'Pat', text: 'An agent is merging master in.', taskId: 't1' }} onFix={() => {}} onOpen={() => {}} onAcknowledge={() => {}} onAnswer={() => {}} />);
    let ask = null;
    await waitFor(() => { ask = document.querySelector('.hb-inbox-approval'); expect(ask).toBeTruthy(); });
    expect(ask.textContent).toContain('Allow: Run a command');
    expect(ask.querySelector('code').textContent).toBe(`cat ${ENV}`);
  });
});
