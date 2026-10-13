/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IdeaWindow } from '../src/components/IdeaWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Expanded ideas' }),
    })
  );
  useWorkspaceStore.setState({ workspaceId: 'ws-test-1' });
});

afterEach(cleanup);

test('renders IdeaWindow with heading and empty bullet state', async () => {
  const win = { id: 'w-idea', kind: 'idea', title: 'Idea Pad' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<IdeaWindow win={win} onUpdate={onUpdate} />);
  });

  expect(screen.getByText('Idea Pad')).toBeInTheDocument();
  expect(
    screen.getByText(/Throw messy fragments here/i)
  ).toBeInTheDocument();
});

test('adds a bullet when typing a thought and clicking the add button', async () => {
  const win = { id: 'w-idea', kind: 'idea', title: 'Idea Pad' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<IdeaWindow win={win} onUpdate={onUpdate} />);
  });

  const input = screen.getByPlaceholderText('Add a thought...');
  const addBtn = screen.getByTitle('Add bullet');

  await act(async () => {
    fireEvent.change(input, { target: { value: 'Redesign onboarding flow' } });
  });

  await act(async () => {
    fireEvent.click(addBtn);
  });

  expect(screen.getByDisplayValue('Redesign onboarding flow')).toBeInTheDocument();
});
