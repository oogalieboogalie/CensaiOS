/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { N8nWindow } from '../src/components/N8nWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  global.fetch = jest.fn();
});

afterEach(cleanup);

describe('N8nWindow', () => {
  test('renders without throwing and displays empty state when not configured', () => {
    const win = { id: 'w-n8n', kind: 'n8n' };
    const onUpdate = jest.fn();

    render(<N8nWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('n8n')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('Connect to n8n')).toBeInTheDocument();
  });

  test('submitting URL form calls onUpdate with the typed URL', () => {
    const win = { id: 'w-n8n', kind: 'n8n' };
    const onUpdate = jest.fn();

    render(<N8nWindow win={win} onUpdate={onUpdate} />);

    const input = screen.getByPlaceholderText('http://localhost:5678');
    fireEvent.change(input, { target: { value: 'http://n8n.my-domain.com:5678' } });

    const loadBtn = screen.getByRole('button', { name: 'Load' });
    fireEvent.click(loadBtn);

    expect(onUpdate).toHaveBeenCalledWith({ url: 'http://n8n.my-domain.com:5678' });
  });

  test('renders iframe and Change URL button when configured', () => {
    const win = { id: 'w-n8n', kind: 'n8n', url: 'http://localhost:5678' };
    const onUpdate = jest.fn();

    render(<N8nWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('http://localhost:5678')).toBeInTheDocument();
    const iframe = screen.getByTitle('n8n');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'http://localhost:5678');

    const changeBtn = screen.getByRole('button', { name: 'Change URL' });
    fireEvent.click(changeBtn);

    expect(onUpdate).toHaveBeenCalledWith({ url: null });
  });
});
