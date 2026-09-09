/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

describe('TodosWindow operational intelligence bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useWorkspaceStore.getState().setWorkspaceId('workspace-test');
    });
  });

  test('falls back to local window items when the feature route is disabled', async () => {
    global.fetch = jest.fn(async () => ({ status: 404, ok: false, json: async () => ({}) }));
    const onUpdate = jest.fn();

    render(React.createElement(TodosWindow, {
      win: { id: 'todos-1', kind: 'todos', items: [] },
      onUpdate,
      currentProject: null,
    }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/operational-intelligence/todos/open',
      expect.any(Object)
    ));

    fireEvent.change(screen.getByPlaceholderText('add a to-do'), { target: { value: 'Local task' } });
    fireEvent.keyDown(screen.getByPlaceholderText('add a to-do'), { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({
      items: [expect.objectContaining({ text: 'Local task', done: false, assignee: null })],
    });
  });

  test('opens and adds todos through artifact-backed API when enabled', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (url === '/api/operational-intelligence/todos/open') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [{ id: 'task-1', text: 'Seed task', done: false, assignee: null }],
          }),
        };
      }
      if (url === '/api/operational-intelligence/todos/list-artifact/items') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [
              { id: 'task-1', text: 'Seed task', done: false, assignee: null },
              { id: 'task-2', text: 'Artifact task', done: false, assignee: null },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url} ${options?.method || 'GET'}`);
    });
    const onUpdate = jest.fn();

    const { rerender } = render(React.createElement(TodosWindow, {
      win: { id: 'todos-1', kind: 'todos', title: 'Plan', items: [] },
      onUpdate,
      currentProject: null,
    }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'list-artifact',
      operationalIntelligence: true,
    })));

    rerender(React.createElement(TodosWindow, {
      win: {
        id: 'todos-1',
        kind: 'todos',
        title: 'Plan',
        artifactId: 'list-artifact',
        operationalIntelligence: true,
        items: [{ id: 'task-1', text: 'Seed task', done: false, assignee: null }],
      },
      onUpdate,
      currentProject: null,
    }));

    fireEvent.change(screen.getByPlaceholderText('add a to-do'), { target: { value: 'Artifact task' } });
    fireEvent.keyDown(screen.getByPlaceholderText('add a to-do'), { key: 'Enter' });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/operational-intelligence/todos/list-artifact/items',
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ id: 'task-2', text: 'Artifact task' })]),
    })));
  });

  test('persists handoff metadata on the linked todo artifact', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (url === '/api/operational-intelligence/todos/open') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [{ id: 'task-1', text: 'Implement from board', done: false, assignee: 'architect' }],
          }),
        };
      }
      if (url === '/api/operational-intelligence/todos/list-artifact/items/task-1/dispatch') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [{
              id: 'task-1',
              text: 'Implement from board',
              done: false,
              assignee: 'architect',
              handoffTaskId: 'agent-task-1',
              handoffPath: '.team/handoffs/implement-from-board.md',
              implementationStatus: 'queued',
              implementationTarget: 'architect',
            }],
            dispatch: { status: 'queued', idempotencyKey: 'key-1' },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url} ${options?.method || 'GET'}`);
    });
    const onUpdate = jest.fn();

    const { rerender } = render(React.createElement(TodosWindow, {
      win: { id: 'todos-1', kind: 'todos', title: 'Plan', items: [] },
      onUpdate,
      currentProject: { path: 'C:/Homebase/CensaiHub' },
    }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'list-artifact',
    })));

    rerender(React.createElement(TodosWindow, {
      win: {
        id: 'todos-1',
        kind: 'todos',
        title: 'Plan',
        artifactId: 'list-artifact',
        operationalIntelligence: true,
        items: [{ id: 'task-1', text: 'Implement from board', done: false, assignee: 'architect' }],
      },
      onUpdate,
      currentProject: { path: 'C:/Homebase/CensaiHub' },
    }));

    fireEvent.click(screen.getByTitle('Create project handoff'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/operational-intelligence/todos/list-artifact/items/task-1/dispatch',
      expect.objectContaining({ method: 'POST' })
    ));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({
        handoffTaskId: 'agent-task-1',
        handoffPath: '.team/handoffs/implement-from-board.md',
        implementationStatus: 'queued',
        implementationTarget: 'architect',
      })]),
    }));
  });

  test('renders color-coded status badges for implementation statuses', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        artifactId: 'list-artifact',
        items: [
          { id: 'task-1', text: 'Queued task', done: false, assignee: 'atlas', implementationStatus: 'queued', handoffPath: '.team/handoffs/test.md' },
          { id: 'task-2', text: 'PR task', done: false, assignee: 'atlas', implementationStatus: 'pr_open', prNumber: 42, prUrl: 'https://github.com/o/r/pull/42' },
          { id: 'task-3', text: 'Needs contract', done: false, assignee: 'atlas', implementationStatus: 'needs_contract', contractMissing: ['files', 'acceptance'] },
          { id: 'task-4', text: 'Merged task', done: true, assignee: 'atlas', implementationStatus: 'merged' },
        ],
      }),
    }));
    const onUpdate = jest.fn();

    const { rerender } = render(React.createElement(TodosWindow, {
      win: { id: 'todos-1', kind: 'todos', title: 'Plan', items: [] },
      onUpdate,
      currentProject: { path: 'C:/Homebase/CensaiHub' },
    }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'list-artifact',
    })));

    rerender(React.createElement(TodosWindow, {
      win: {
        id: 'todos-1', kind: 'todos', title: 'Plan',
        artifactId: 'list-artifact', operationalIntelligence: true,
        items: [
          { id: 'task-1', text: 'Queued task', done: false, assignee: 'atlas', implementationStatus: 'queued', handoffPath: '.team/handoffs/test.md' },
          { id: 'task-2', text: 'PR task', done: false, assignee: 'atlas', implementationStatus: 'pr_open', prNumber: 42, prUrl: 'https://github.com/o/r/pull/42' },
          { id: 'task-3', text: 'Needs contract', done: false, assignee: 'atlas', implementationStatus: 'needs_contract', contractMissing: ['files', 'acceptance'] },
          { id: 'task-4', text: 'Merged task', done: false, assignee: 'atlas', implementationStatus: 'merged' },
        ],
      },
      onUpdate,
      currentProject: { path: 'C:/Homebase/CensaiHub' },
    }));

    expect(screen.getByText('queued')).toBeTruthy();
    expect(screen.getByText('PR #42')).toBeTruthy();
    expect(screen.getByText('needs contract')).toBeTruthy();
    expect(screen.getByText('merged ✓')).toBeTruthy();

    const prLink = screen.getByText('PR #42').closest('a');
    expect(prLink).toBeTruthy();
    expect(prLink.getAttribute('href')).toBe('https://github.com/o/r/pull/42');
  });

  test('refreshes via GET when tasks-updated event fires', async () => {
    global.fetch = jest.fn(async (url) => {
      if (url === '/api/operational-intelligence/todos/open') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [{ id: 'task-1', text: 'Working', done: false, assignee: 'atlas', implementationStatus: 'dispatched' }],
          }),
        };
      }
      if (url === '/api/operational-intelligence/todos/list-artifact?workspaceId=workspace-test') {
        return {
          ok: true,
          json: async () => ({
            artifactId: 'list-artifact',
            items: [{ id: 'task-1', text: 'Working', done: false, assignee: 'atlas', implementationStatus: 'pr_open', prNumber: 99 }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const onUpdate = jest.fn();

    const { rerender } = render(React.createElement(TodosWindow, {
      win: { id: 'todos-1', kind: 'todos', title: 'Plan', items: [] },
      onUpdate,
      currentProject: null,
    }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'list-artifact',
    })));

    // Rerender with the artifactId set so the refresh effect hooks up
    rerender(React.createElement(TodosWindow, {
      win: {
        id: 'todos-1', kind: 'todos', title: 'Plan',
        artifactId: 'list-artifact', operationalIntelligence: true,
        items: [{ id: 'task-1', text: 'Working', done: false, assignee: 'atlas', implementationStatus: 'dispatched' }],
      },
      onUpdate,
      currentProject: null,
    }));

    // Simulate the tasks-updated event (immediate refresh)
    await act(async () => {
      window.dispatchEvent(new Event('tasks-updated'));
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/operational-intelligence/todos/list-artifact?workspaceId=workspace-test',
      expect.any(Object)
    ));
  });
});
