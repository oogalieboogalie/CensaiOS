/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppearanceWindow } from '../src/components/AppearanceWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => [],
    })
  );
  useWorkspaceStore.setState({ focusMode: false, penMode: false });
});

afterEach(cleanup);

test('renders AppearanceWindow with heading and tab choices', async () => {
  const win = { id: 'w-app', kind: 'appearance', title: 'Settings' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<AppearanceWindow win={win} onUpdate={onUpdate} />);
  });

  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sharing' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Modules' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AI keys' })).toBeInTheDocument();
});

test('switching tab to Canvas shows workspace settings content', async () => {
  const win = { id: 'w-app', kind: 'appearance', title: 'Settings' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<AppearanceWindow win={win} onUpdate={onUpdate} />);
  });

  const canvasTabBtn = screen.getByRole('button', { name: 'Canvas' });
  await act(async () => {
    fireEvent.click(canvasTabBtn);
  });

  expect(screen.getByText('Canvas behavior')).toBeInTheDocument();
  expect(screen.getByText('Focus Mode')).toBeInTheDocument();
});
