/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ResearchWindow } from '../src/components/windows/research/index.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const REFS = {
  ok: true, recipe: 'references', input: 'sleep and memory', saved: 1, modelUsed: true,
  refs: [{ url: 'https://journal.example/sleep', title: 'Sleep and memory', author: 'Maria Lopez', year: '2024', site: 'journal.example', summary: 'Teens recalled more.', citable: true }],
};
const BRIEF = {
  ok: true, recipe: 'market', input: 'NVDA', refreshedAt: '2026-10-08T15:00:00Z', watch: 'Guidance call on Oct 22.',
  items: [{ url: 'https://news.example/a', title: 'NVDA beats', source: 'news.example', publishedAt: '2026-10-08T14:00:00Z', summary: 'Nvidia beat revenue estimates.' }],
};

function mockFetch() {
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = url.split('?')[0];
    const ok = (body) => ({ ok: true, json: async () => body });
    if (path === '/api/research/status') return ok({ tavily: { configured: true }, embedding: { label: 'Keyword ranking' } });
    if (path === '/api/research/kb') return ok({ sources: [] });
    if (path === '/api/research/recipe') return ok(JSON.parse(opts.body).recipe === 'market' ? BRIEF : REFS);
    return { ok: false, json: async () => ({ error: 'unexpected' }) };
  });
}

function Harness() {
  const [win, setWin] = React.useState({ id: 'r1', x: 0, y: 0, w: 760 });
  return <ResearchWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(cleanup);

describe('Research recipes', () => {
  test('References lists citable sources with APA and MLA; Market brief has a what-to-watch line', async () => {
    mockFetch();
    await act(async () => { render(<Harness />); });
    fireEvent.click(screen.getByRole('tab', { name: 'Recipes' }));
    fireEvent.change(screen.getByLabelText('References input'), { target: { value: 'sleep and memory' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    expect(await screen.findByText('Lopez, M. (2024). Sleep and memory. journal.example. https://journal.example/sleep')).toBeTruthy();
    expect(screen.getByText('saved to the knowledge base')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /Market brief/ }));
    fireEvent.change(screen.getByLabelText('Market brief input'), { target: { value: 'NVDA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get brief' }));
    expect(await screen.findByText('Guidance call on Oct 22.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeTruthy();
  });

  test('Compare and price opens a board sheet; Sales leads opens LeadHound', async () => {
    mockFetch();
    const spawnAt = jest.fn(() => 'new');
    useWorkspaceStore.setState({ spawnAt, wins: [] });
    await act(async () => { render(<Harness />); });
    fireEvent.click(screen.getByRole('tab', { name: 'Recipes' }));
    fireEvent.click(screen.getByRole('radio', { name: /Compare and price/ }));
    fireEvent.change(screen.getByLabelText('Compare and price input'), { target: { value: 'oat milk and almond milk vs soy milk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build chart' }));
    const [kind, props] = spawnAt.mock.calls[0];
    expect(kind).toBe('sheets');
    expect(props.sheet.rows).toHaveLength(3);
    expect(props.sheet.autoRun.length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('radio', { name: /Sales leads/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open LeadHound' }));
    expect(spawnAt.mock.calls[1][0]).toBe('leadHound');
  });
});
