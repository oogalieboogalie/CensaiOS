/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilesWindow } from '../src/components/FilesWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  global.fetch = jest.fn();
});

afterEach(cleanup);

describe('FilesWindow', () => {
  test('renders without throwing and displays main heading and empty state', () => {
    const win = { id: 'w-files', kind: 'files', mode: 'local' };
    const onUpdate = jest.fn();

    render(<FilesWindow win={win} onUpdate={onUpdate} wins={[]} />);

    expect(screen.getByText('Project files')).toBeInTheDocument();
    expect(screen.getByText('Local Explorer')).toBeInTheDocument();
  });

  test('clicking mode toggle calls onUpdate with the selected mode', () => {
    const win = { id: 'w-files', kind: 'files', mode: 'local' };
    const onUpdate = jest.fn();

    render(<FilesWindow win={win} onUpdate={onUpdate} wins={[]} />);

    const githubButton = screen.getByRole('button', { name: 'GitHub' });
    fireEvent.click(githubButton);

    expect(onUpdate).toHaveBeenCalledWith({ mode: 'github' });
  });

  test('a window moved to another folder lists that folder, not the old one', async () => {
    const listings = {
      'D:\\Repos\\CensaiHub': [{ name: 'docs', isDir: true, path: 'D:\\Repos\\CensaiHub\\docs' }, { name: 'README.md', isDir: false, path: 'D:\\Repos\\CensaiHub\\README.md' }],
      'D:\\Repos\\CensaiHub\\docs': [{ name: 'spec.md', isDir: false, path: 'D:\\Repos\\CensaiHub\\docs\\spec.md' }],
    };
    global.fetch = jest.fn(async (url) => {
      const asked = decodeURIComponent(String(url).split('path=')[1] || '');
      return { ok: true, json: async () => ({ children: listings[asked] || [] }) };
    });
    const win = { id: 'w-files', kind: 'files', mode: 'local', dirPath: 'D:\\Repos\\CensaiHub' };
    const { rerender } = render(<FilesWindow win={win} onUpdate={jest.fn()} wins={[]} />);
    await screen.findByText(/README\.md/);

    await act(async () => {
      rerender(<FilesWindow win={{ ...win, dirPath: 'D:\\Repos\\CensaiHub\\docs' }} onUpdate={jest.fn()} wins={[]} />);
    });
    await screen.findByText(/spec\.md/);
    expect(screen.queryByText(/README\.md/)).toBeNull();
    expect(screen.getByDisplayValue('D:\\Repos\\CensaiHub\\docs')).toBeInTheDocument();
  });

  test('a folder that cannot be listed says why instead of looking empty', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "censaiOS can't see D:\\Archive." }) }));
    render(<FilesWindow win={{ id: 'w', kind: 'files', mode: 'local', dirPath: 'D:\\Archive' }} onUpdate={jest.fn()} wins={[]} />);
    await waitFor(() => expect(screen.getByTestId('tree-folder-note')).toHaveTextContent("can't see D:\\Archive"));
  });
});
