/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

describe('TodosWindow operational intelligence fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useWorkspaceStore.getState().setWorkspaceId('workspace-test');
    });
  });

  test('falls back to local edits when artifact-backed open errors', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'database unavailable' }),
    }));
    const onUpdate = jest.fn();

    render(React.createElement(TodosWindow, {
      win: {
        id: 'todos-1',
        kind: 'todos',
        artifactId: 'list-artifact',
        operationalIntelligence: true,
        items: [{ id: 'task-1', text: 'Existing local task', done: false, assignee: null }],
      },
      onUpdate,
      currentProject: null,
    }));

    await waitFor(() => expect(screen.getByText('database unavailable')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('add a to-do'), { target: { value: 'Local fallback task' } });
    fireEvent.keyDown(screen.getByPlaceholderText('add a to-do'), { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({
      items: expect.arrayContaining([
        expect.objectContaining({ text: 'Existing local task' }),
        expect.objectContaining({ text: 'Local fallback task', done: false, assignee: null }),
      ]),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
