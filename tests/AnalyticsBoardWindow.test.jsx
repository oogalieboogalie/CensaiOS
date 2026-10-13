/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnalyticsBoardWindow } from '../src/components/AnalyticsBoardWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const originalState = useWorkspaceStore.getState();

function jsonResponse(payload = [], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/agent-tasks')) {
      return jsonResponse([
        {
          id: 'task-1',
          created_at: new Date().toISOString(),
          status: 'completed',
          agent_id: 'atlas',
        },
      ]);
    }
    return jsonResponse([]);
  });
  act(() => {
    useWorkspaceStore.setState({ workspaceId: 'ws-analytics-test', wins: [] });
  });
});

afterEach(() => {
  cleanup();
  act(() => useWorkspaceStore.setState(originalState));
  delete global.fetch;
});

describe('AnalyticsBoardWindow', () => {
  test('renders without throwing and displays heading and task cards', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'ab1', kind: 'analytics', title: 'Analytics Board' };

    await act(async () => {
      render(<AnalyticsBoardWindow win={win} onUpdate={onUpdate} />);
    });

    expect(screen.getByText('Analytics Board')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Busiest agents (7 days)')).toBeInTheDocument();
    expect(screen.getByText('On the canvas now')).toBeInTheDocument();
  });

  test('refreshes task data on refresh button click', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'ab1', kind: 'analytics', title: 'Analytics Board' };

    await act(async () => {
      render(<AnalyticsBoardWindow win={win} onUpdate={onUpdate} />);
    });

    const callsBefore = global.fetch.mock.calls.length;
    const refreshBtn = screen.getByRole('button', { name: /refresh analytics/i });

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent-tasks?limit=500&workspaceId=ws-analytics-test')
    );
  });
});
