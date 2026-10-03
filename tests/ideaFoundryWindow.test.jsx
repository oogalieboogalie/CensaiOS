/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { IdeaFoundryWindow } from '../src/components/IdeaFoundryWindow.jsx';
import { FACTORY_WINDOW_MANIFESTS } from '../src/lib/manifest/factoryWindows.js';

const firstIndex = [
  { kind: 'valid', path: '2026-06-06-alpha.md', title: 'Alpha canvas', date: '2026-06-06', source: 'notes', status: 'placed', phase: '1', tags: ['canvas'] },
  { kind: 'valid', path: '2026-06-07-beta.md', title: 'Beta billing', date: '2026-06-07', source: 'notes', status: 'parked', phase: '4', tags: ['billing'] },
];

function mockFetch(impl) {
  // This jsdom build has no global fetch, so assign instead of spying.
  global.fetch = jest.fn().mockImplementation(impl);
}

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

function getIdeas() {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ cards: firstIndex, summary: {} }) });
}

describe('IdeaFoundryWindow', () => {
  test('renders idea cards from the index', async () => {
    mockFetch(() => getIdeas());
    render(<IdeaFoundryWindow win={{}} />);
    expect(await screen.findByText('Alpha canvas')).toBeInTheDocument();
    expect(screen.getByText('Beta billing')).toBeInTheDocument();
  });

  test('status filter narrows the visible cards', async () => {
    mockFetch(() => getIdeas());
    render(<IdeaFoundryWindow win={{}} />);
    await screen.findByText('Alpha canvas');
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'parked' } });
    expect(screen.queryByText('Alpha canvas')).not.toBeInTheDocument();
    expect(screen.getByText('Beta billing')).toBeInTheDocument();
  });

  test('updating a disposition POSTs and refreshes the index', async () => {
    const calls = [];
    const updated = firstIndex.map((c) => (c.path === '2026-06-07-beta.md' ? { ...c, status: 'placed' } : c));
    let n = 0;
    mockFetch((url, options) => {
      calls.push([url, options]);
      if (url === '/api/ideas/disposition') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      n += 1;
      const cards = n === 1 ? firstIndex : updated;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ cards, summary: {} }) });
    });
    render(<IdeaFoundryWindow win={{}} />);
    await screen.findByText('Beta billing');
    fireEvent.click(screen.getByText('Beta billing'));
    fireEvent.change(screen.getByLabelText('Disposition for 2026-06-07-beta.md'), { target: { value: 'placed' } });
    const post = calls.find(([url]) => url === '/api/ideas/disposition');
    expect(JSON.parse(post[1].body)).toEqual({ file: '2026-06-07-beta.md', disposition: 'placed' });
    await waitFor(() => expect(screen.getAllByText('Beta billing').length).toBeGreaterThan(0));
  });

  test('manifest registers the Idea Foundry window', () => {
    const entry = FACTORY_WINDOW_MANIFESTS.find((m) => m.kind === 'ideaFoundry');
    expect(entry).toMatchObject({
      componentName: 'IdeaFoundryWindow',
      componentPath: 'src/components/IdeaFoundryWindow.jsx',
      label: 'Idea Foundry',
    });
    expect(entry.defaultSize).toEqual({ w: 1000, h: 800 });
  });
});
