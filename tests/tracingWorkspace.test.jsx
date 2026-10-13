/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { TracingWindow } from '../src/components/TracingWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import {
  convertTraceToTest,
  getTraceEvents,
  getTraces,
} from '../src/lib/api/tracing.js';

const originalState = useWorkspaceStore.getState();

function response(payload = [], options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: jest.fn().mockResolvedValue(payload),
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(response());
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});

afterAll(() => {
  act(() => useWorkspaceStore.setState(originalState));
  delete global.fetch;
});

describe('tracing workspace client', () => {
  test('propagates the workspace query on list, event, and conversion requests', async () => {
    await getTraces('workspace / active');
    await getTraceEvents('workspace / active', 'trace/one');
    await convertTraceToTest('workspace / active', 'trace/one');

    const [list, events, conversion] = global.fetch.mock.calls;
    expect(list[0]).toBe('/api/operational-intelligence/traces?workspaceId=workspace+%2F+active');
    expect(events[0]).toBe('/api/operational-intelligence/traces/trace%2Fone/events?workspaceId=workspace+%2F+active');
    expect(conversion[0]).toBe('/api/operational-intelligence/traces/trace%2Fone/convert-to-test?workspaceId=workspace+%2F+active');
    expect(conversion[1]).toEqual({ method: 'POST' });
  });

  test('refuses every operation when there is no active workspace', () => {
    expect(() => getTraces(' ')).toThrow('Open a workspace');
    expect(() => getTraceEvents(null, 'trace-one')).toThrow('Open a workspace');
    expect(() => convertTraceToTest(undefined, 'trace-one')).toThrow('Open a workspace');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('preserves backend and network errors', async () => {
    global.fetch.mockResolvedValueOnce(response({
      error: 'Workspace access denied',
      code: 'workspace_denied',
      details: { workspaceId: 'foreign' },
    }, { ok: false, status: 403 }));

    await expect(getTraces('workspace-active')).rejects.toMatchObject({
      message: 'Workspace access denied',
      status: 403,
      code: 'workspace_denied',
      payload: { details: { workspaceId: 'foreign' } },
    });

    const networkError = new Error('connection lost');
    global.fetch.mockRejectedValueOnce(networkError);
    await expect(getTraceEvents('workspace-active', 'trace-one')).rejects.toBe(networkError);
  });
});

describe('TracingWindow workspace boundary', () => {
  test('shows a blocking empty state and performs no request without a workspace', () => {
    render(<TracingWindow win={{ title: 'Agentic Tracing' }} onUpdate={jest.fn()} />);

    expect(screen.getByTestId('tracing-workspace-required')).toHaveTextContent(
      'Open a workspace to inspect its agent traces.'
    );
    expect(screen.getByRole('button', { name: 'Refresh traces' })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('loads the active Zustand workspace', async () => {
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-active' }));
    render(<TracingWindow win={{ title: 'Agentic Tracing' }} onUpdate={jest.fn()} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/operational-intelligence/traces?workspaceId=workspace-active',
      undefined
    ));
    expect(screen.queryByTestId('tracing-workspace-required')).not.toBeInTheDocument();
  });

  test('does not display an in-flight response from the previous workspace', async () => {
    let resolvePrevious;
    global.fetch.mockImplementationOnce(() => new Promise(resolve => {
      resolvePrevious = resolve;
    }));
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-previous' }));
    render(<TracingWindow win={{ title: 'Agentic Tracing' }} onUpdate={jest.fn()} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-current' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await act(async () => resolvePrevious(response([{
      id: 'trace-previous',
      title: 'Previous workspace trace',
      created_at: '2026-07-13T00:00:00.000Z',
      data: { status: 'completed' },
    }])));

    expect(screen.queryByText('Previous workspace trace')).not.toBeInTheDocument();
  });
});
