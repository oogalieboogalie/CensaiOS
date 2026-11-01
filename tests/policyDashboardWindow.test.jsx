/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PolicyDashboardWindow } from '../src/components/PolicyDashboardWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const path = String(url);
    if (path.includes('/api/tool-approvals')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          approvals: [],
          canDecide: true,
        }),
      });
    }
    if (path.includes('/api/agent-trust')) {
      // Trust mode off, so the queue shows actions waiting for approval.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ board: false, agents: {} }),
      });
    }
    if (path.includes('/api/cli-agents/permissions')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          permissions: [],
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });
  useWorkspaceStore.setState({ workspaceId: 'ws-policy-test' });
});

afterEach(cleanup);

test('renders PolicyDashboardWindow heading and initial empty state', async () => {
  const win = { id: 'w-pol', kind: 'policy_dashboard', title: 'Action Approvals' };

  await act(async () => {
    render(<PolicyDashboardWindow win={win} isActive={true} />);
  });

  expect(screen.getByText('Action Approvals')).toBeInTheDocument();
  expect(
    await screen.findByText('No agent actions are waiting for approval.')
  ).toBeInTheDocument();
});

test('toggling Pending only checkbox updates empty state message', async () => {
  const win = { id: 'w-pol', kind: 'policy_dashboard', title: 'Action Approvals' };

  await act(async () => {
    render(<PolicyDashboardWindow win={win} isActive={true} />);
  });

  await screen.findByText('No agent actions are waiting for approval.');

  const checkbox = screen.getByLabelText('Pending only');
  expect(checkbox).toBeChecked();

  await act(async () => {
    fireEvent.click(checkbox);
  });

  expect(checkbox).not.toBeChecked();
  expect(
    screen.getByText('No approval history in this workspace.')
  ).toBeInTheDocument();
});

test('does not claim Trust mode is on when it could not be read', async () => {
  const base = global.fetch;
  global.fetch = jest.fn((url) => (String(url).includes('/api/agent-trust')
    ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Trust mode could not be read.' }) })
    : base(url)));
  await act(async () => {
    render(<PolicyDashboardWindow win={{ id: 'w-pol2', kind: 'policy_dashboard' }} isActive={true} />);
  });
  expect(await screen.findByText('No agent actions are waiting for approval.')).toBeInTheDocument();
  expect(screen.queryByText(/Trust mode is on/)).toBeNull();
});
