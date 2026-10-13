/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GovernanceWindow } from '../src/components/GovernanceWindow.jsx';
import { api } from '../src/lib/api.js';

function jsonResponse(payload = [], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('vex.run.completed')) {
      return jsonResponse([
        {
          id: 'evt-1',
          created_at: new Date().toISOString(),
          payload: {
            task: 'security_scan',
            verdict: 'clean',
            agents_succeeded: 1,
            agents_dispatched: 1,
          },
        },
      ]);
    }
    return jsonResponse([]);
  });

  api.get = jest.fn((endpoint) =>
    global.fetch(`/api${endpoint}`).then((res) => res.json())
  );
});

afterEach(() => {
  cleanup();
  delete global.fetch;
  delete api.get;
});

describe('GovernanceWindow', () => {
  test('renders without throwing, showing heading and validation history table', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'gov1', kind: 'governance', title: 'AI Governance' };

    await act(async () => {
      render(<GovernanceWindow win={win} onUpdate={onUpdate} />);
    });

    expect(screen.getByText('AI Governance')).toBeInTheDocument();
    expect(screen.getByText('Validation History')).toBeInTheDocument();
    expect(screen.getByText('Total Scans')).toBeInTheDocument();
    expect(screen.getAllByText('security_scan').length).toBeGreaterThan(0);
  });

  test('clicking refresh triggers history fetch and updates state', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'gov1', kind: 'governance', title: 'AI Governance' };

    await act(async () => {
      render(<GovernanceWindow win={win} onUpdate={onUpdate} />);
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    const callsBefore = api.get.mock.calls.length;

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(api.get).toHaveBeenCalledWith('/operational-intelligence/events?type=vex.run.completed&limit=20');
  });
});
