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

  test('clicking a file that is already open brings its window forward instead of opening it twice, gliding the board to it', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ children: [{ name: 'README.md', isDir: false, path: '/made-up/README.md' }] }) }));
    const onSpawn = jest.fn();
    const onSelect = jest.fn();
    // On the board a window's `wins` prop holds only where windows are; the board's own list has each window's file.
    // That window sits below the bottom of the screen.
    useWorkspaceStore.setState({ pan: { x: 0, y: 0 }, zoom: 1, wins: [{ id: 'made-up-doc', kind: 'doc', filePath: '/made-up/README.md', isEditing: true, x: 40, y: 1600, w: 520, h: 250 }] });
    render(<FilesWindow win={{ id: 'w', kind: 'files', mode: 'local', dirPath: '/made-up' }} onUpdate={jest.fn()} onSpawn={onSpawn}
      onSelect={onSelect} wins={[{ id: 'made-up-doc', x: 40, y: 1600, w: 520, h: 250 }]} />);
    const row = await screen.findByText(/README\.md/);
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: 5, clientY: 5 });
    expect(onSelect).toHaveBeenCalledWith('made-up-doc');
    expect(onSpawn).not.toHaveBeenCalled();
    // Glided up just far enough that the window's bottom edge is on screen.
    await waitFor(() => expect(useWorkspaceStore.getState().pan.y).toBe(-(1600 + 250 + 48 - window.innerHeight)));
  });

  test('a folder that cannot be listed says why instead of looking empty', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "censaiOS can't see D:\\Archive." }) }));
    render(<FilesWindow win={{ id: 'w', kind: 'files', mode: 'local', dirPath: 'D:\\Archive' }} onUpdate={jest.fn()} wins={[]} />);
    await waitFor(() => expect(screen.getByTestId('tree-folder-note')).toHaveTextContent("can't see D:\\Archive"));
  });
});
