/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
