/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { GithubConsoleWindow } from '../src/components/GithubConsoleWindow.jsx';
import { rowAction } from '../src/components/github/PrRow.jsx';

const pr = (n, over = {}) => ({
  number: n, title: `PR ${n}`, url: `https://github.com/o/r/pull/${n}`, author: 'alex', draft: false,
  summary: `Summary ${n}`, checks: { state: 'passed', text: 'Checks passed', failing: [] },
  conflicts: false, mergeKnown: true, green: true, ...over,
});

function mockFetch({ connected = true, prs, mergeFails = false } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (url === '/api/github/desk/status') return ok({ connected, source: connected ? 'byok' : null, me: 'Alex' });
    if (url.startsWith('/api/github/desk?')) return ok({ repo: 'o/r', prs, recent: [], fetchedAt: new Date().toISOString() });
    if (url === '/api/github/desk/merge') {
      return mergeFails
        ? { ok: false, status: 409, json: async () => ({ error: 'This PR has conflicts. Tap Fix conflicts first.' }) }
        : ok({ merged: true, sha: 's', by: 'Alex', mergedAt: new Date().toISOString() });
    }
    if (url === '/api/github/desk/fix') return ok({ job: { id: 'j1', status: 'agent', text: 'An agent is merging master in.', by: 'Alex' } });
    if (url === '/api/keys') return ok({ ok: true });
    if (url === '/api/projects' || url.startsWith('/api/projects')) return ok([]);
    return ok({});
  });
  return calls;
}

// The window writes shared fields through onUpdate; feed them back like the board does.
function Harness({ initial }) {
  const [win, setWin] = React.useState(initial);
  return <GithubConsoleWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

describe('GitHub window merge desk', () => {
  test('the row button says what will happen', () => {
    expect(rowAction(pr(1), null).kind).toBe('merge');
    expect(rowAction(pr(1, { conflicts: true }), null).label).toBe('Fix conflicts');
    expect(rowAction(pr(1, { checks: { state: 'running' } }), null).label).toBe('Waiting for checks');
    expect(rowAction(pr(1, { checks: { state: 'failed' } }), null).label).toBe('Merge anyway');
    expect(rowAction(pr(1), { state: 'merging' }).label).toBe('Merging…');
  });

  test('one tap merges, the PR moves to Recently merged, no confirm dialog', async () => {
    const calls = mockFetch({ prs: [pr(7), pr(8, { conflicts: true, green: false })] });
    render(<Harness initial={{ id: 'w', state: { repo: 'o/r' } }} />);
    await screen.findByText('PR 7');
    expect(screen.getByText(/Merge all green \(1\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fix conflicts' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Merge' })); });
    await waitFor(() => expect(screen.getByText('Recently merged')).toBeTruthy());
    expect(calls.find((c) => c.url === '/api/github/desk/merge').body).toEqual({ repo: 'o/r', number: 7 });
  });

  test('Fix conflicts hands the PR to an agent and shows progress on the row', async () => {
    mockFetch({ prs: [pr(8, { conflicts: true, green: false })] });
    render(<Harness initial={{ id: 'w', state: { repo: 'o/r' } }} />);
    const fix = await screen.findByRole('button', { name: 'Fix conflicts' });
    await act(async () => { fireEvent.click(fix); });
    await screen.findByText(/An agent is merging master in/);
    expect(screen.getByRole('button', { name: 'Fixing…' }).disabled).toBe(true);
  });

  test('a refused merge explains itself on the row', async () => {
    mockFetch({ prs: [pr(7)], mergeFails: true });
    render(<Harness initial={{ id: 'w', state: { repo: 'o/r' } }} />);
    const merge = await screen.findByRole('button', { name: 'Merge' });
    await act(async () => { fireEvent.click(merge); });
    await screen.findByText(/Tap Fix conflicts first/);
  });

  test('no token shows one field to connect', async () => {
    const calls = mockFetch({ connected: false, prs: [] });
    render(<Harness initial={{ id: 'w', state: { repo: 'o/r' } }} />);
    const input = await screen.findByLabelText('GitHub token');
    fireEvent.change(input, { target: { value: 'ghp_x' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })); });
    expect(calls.find((c) => c.url === '/api/keys').body).toEqual({ provider: 'github', apiKey: 'ghp_x' });
  });
});
