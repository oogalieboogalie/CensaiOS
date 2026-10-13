/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ResearchWindow } from '../src/components/windows/research/index.jsx';
import { windowMeta } from '../src/components/windows/research/meta.js';

const SEARCH = {
  ok: true, query: 'acme hq', depth: 'basic', includeAnswer: true, searchedAt: '2026-10-08T12:00:00Z',
  answer: 'Acme is based in Austin.',
  results: [
    { url: 'https://acme.example/about', title: 'About Acme', content: 'Austin, Texas', publishedAt: '2026-09-01', score: 0.9 },
    { url: 'https://news.example/acme', title: 'Acme raises', content: 'Series B', publishedAt: null, score: 0.7 },
  ],
};

function mockFetch() {
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = url.split('?')[0];
    const ok = (body) => ({ ok: true, json: async () => body });
    if (path === '/api/research/status') return ok({ tavily: { configured: true, source: 'byok' }, embedding: { model: null, label: 'Keyword ranking (BM25, no key needed)' } });
    if (path === '/api/research/kb' && !opts.method) return ok({ sources: [] });
    if (path === '/api/research/search') return ok(SEARCH);
    if (path === '/api/research/kb/save') {
      const { results } = JSON.parse(opts.body);
      return ok({ saved: results, embedder: 'Keyword ranking', sources: results.map((r, i) => ({ id: `s${i}`, url: r.url, title: r.title, chunkCount: 4, savedAt: '2026-10-08T12:01:00Z' })) });
    }
    if (path === '/api/research/ask') return ok({ answer: 'Austin [1].', sources: [{ n: 1, title: 'About Acme', url: 'https://acme.example/about' }], usedWeb: false });
    return { ok: false, json: async () => ({ error: 'unexpected' }) };
  });
}

// The window writes to its own state; feed it back like the store does.
function Harness({ initial = {} }) {
  const [win, setWin] = React.useState({ id: 'w1', ...initial });
  return <ResearchWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(cleanup);

describe('ResearchWindow', () => {
  test('searches, saves the whole search to the board and asks over it with sources', async () => {
    mockFetch();
    await act(async () => { render(<Harness />); });
    fireEvent.change(screen.getByLabelText('Search the web'), { target: { value: 'acme hq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('About Acme')).toBeTruthy();
    expect(screen.getByText('Acme is based in Austin.')).toBeTruthy();
    const sent = JSON.parse(global.fetch.mock.calls.find(([u]) => u.startsWith('/api/research/search'))[1].body);
    expect(sent).toEqual({ query: 'acme hq', depth: 'advanced', includeAnswer: true });

    fireEvent.click(screen.getByRole('button', { name: 'Save whole search' }));
    await waitFor(() => expect(screen.getAllByText('Saved')).toHaveLength(2));
    fireEvent.click(screen.getByRole('tab', { name: /Knowledge base/ }));
    expect(screen.getByText('2 sources · 8 chunks')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Ask' }));
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'Where is Acme?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Austin [1].')).toBeTruthy();
    expect(screen.getByTestId('knowledge-sources').textContent).toContain('About Acme');
  });

  test('a guest sees the synced search and knowledge base read-only', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})); // the guest fetch guard never answers
    await act(async () => { render(<ResearchWindow win={windowMeta.lab.props} onUpdate={jest.fn()} />); });
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.queryByLabelText('Search the web')).toBeNull();
    expect(screen.getByText('Why small dental offices are moving phones to AI')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
  });
});
