/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilesWindow } from '../src/components/FilesWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const hits = (n) => Array.from({ length: n }, (_, i) => ({ name: `note-${i}.md`, path: `/big/note-${i}.md`, relativePath: `note-${i}.md` }));

beforeEach(() => {
  jest.useFakeTimers();
  useWorkspaceStore.setState({ wins: [] });
});
afterEach(() => { cleanup(); jest.useRealTimers(); delete global.fetch; });

async function searchFor(capped, count) {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => (String(url).includes('/api/files/search') ? { results: hits(count), capped, limit: 100 } : { children: [] }),
  }));
  render(<FilesWindow win={{ id: 'w', kind: 'files', mode: 'local', dirPath: '/big' }} onUpdate={jest.fn()} wins={[]} />);
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText('Filter paths...'), { target: { value: 'note' } });
    jest.advanceTimersByTime(450);
  });
  await act(async () => {});
}

test('a search that stopped at 100 says it is showing the first 100', async () => {
  await searchFor(true, 100);
  expect(screen.getByRole('status')).toHaveTextContent('Showing the first 100. Type more of the name to narrow it down.');
});

test('a search with fewer matches shows no such note', async () => {
  await searchFor(false, 3);
  expect(screen.queryByText(/Showing the first/)).toBeNull();
  expect(screen.getByText(/note-2\.md/)).toBeInTheDocument();
});
