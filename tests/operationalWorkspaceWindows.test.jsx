/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ContextFeedWindow } from '../src/components/ContextFeedWindow.jsx';
import { MlopsDashboardWindow } from '../src/components/MlopsDashboardWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const originalState = useWorkspaceStore.getState();

function response(payload = [], ok = true) {
  return { ok, json: jest.fn().mockResolvedValue(payload) };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(response());
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});

afterAll(() => {
  act(() => useWorkspaceStore.setState(originalState));
  delete global.fetch;
});

describe('operational workspace windows', () => {
  test('does not request context or MLOps data without an active workspace', async () => {
    render(<>
      <ContextFeedWindow />
      <MlopsDashboardWindow win={{ title: 'MLOps' }} onUpdate={jest.fn()} />
    </>);

    await waitFor(() => expect(screen.getByText('No recent activity found.')).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sends the active workspace on context and MLOps reads', async () => {
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace / active' }));
    render(<>
      <ContextFeedWindow workspaceId="stale-window-workspace" />
      <MlopsDashboardWindow win={{ title: 'MLOps' }} onUpdate={jest.fn()} />
    </>);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      '/api/context/feed?workspaceId=workspace%20%2F%20active',
      '/api/mlops/models?workspaceId=workspace%20%2F%20active',
    ]));
  });

  test('does not render in-flight data from a previous workspace', async () => {
    const pending = [];
    global.fetch.mockImplementation(url => new Promise(resolve => pending.push({ url, resolve })));
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-previous' }));
    render(<>
      <ContextFeedWindow />
      <MlopsDashboardWindow win={{ title: 'MLOps' }} onUpdate={jest.fn()} />
    </>);
    await waitFor(() => expect(pending).toHaveLength(2));

    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-current' }));
    await waitFor(() => expect(pending).toHaveLength(4));
    await act(async () => {
      pending.find(item => item.url.startsWith('/api/context/feed?workspaceId=workspace-previous'))
        .resolve(response([{
          id: 'old-context', artifact_type: 'task', title: 'Previous workspace task', data: {},
        }]));
      pending.find(item => item.url.startsWith('/api/mlops/models?workspaceId=workspace-previous'))
        .resolve(response([{
          id: 'old-model', data: { modelName: 'Previous workspace model', version: '1', lastDriftScore: 0 },
        }]));
    });

    expect(screen.queryByText('Previous workspace task')).not.toBeInTheDocument();
    expect(screen.queryByText('Previous workspace model')).not.toBeInTheDocument();
  });
});
