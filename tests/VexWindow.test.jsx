/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VexWindow } from '../src/components/VexWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

let fetchCalls = [];

beforeEach(() => {
  fetchCalls = [];
  useWorkspaceStore.setState({ workspaceId: 'ws-test-vex' });
  global.fetch = jest.fn((url, opts = {}) => {
    fetchCalls.push({ url, method: opts.method || 'GET', body: opts.body });
    if (url.endsWith('/api/vex/agents')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ agents: [{ id: 'vex-agent-1', name: 'Alpha Agent', status: 'idle' }] }),
      });
    }
    if (url.endsWith('/api/vex/run')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ run_id: 'run-101' }),
      });
    }
    if (url.endsWith('/api/vex/runs')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ runs: [] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('renders VexWindow and interacts with tabs and agent dispatch', async () => {
  const win = { id: 'vex-win-1', title: 'Vex' };

  await act(async () => {
    render(<VexWindow win={win} />);
  });

  // Verify main heading and agents count text
  expect(screen.getByText('Vex Orchestrator')).toBeTruthy();
  expect(await screen.findByText('1 agent registered')).toBeTruthy();

  // Click Config tab to switch view
  const configTabBtn = screen.getByRole('button', { name: 'Config' });
  await act(async () => {
    fireEvent.click(configTabBtn);
  });

  // Verify config tab content rendered
  expect(screen.getByText('Run Configuration')).toBeTruthy();

  // Click 'Run all agents' action button
  const runAllBtn = screen.getByRole('button', { name: 'Run all agents' });
  await act(async () => {
    fireEvent.click(runAllBtn);
  });

  // Verify fetch call was made to trigger the run
  expect(fetchCalls.some((c) => c.url.endsWith('/api/vex/run') && c.method === 'POST')).toBe(true);
});
