/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LeadsWindow } from '../src/components/LeadsWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

let fetchCalls = [];

beforeEach(() => {
  fetchCalls = [];
  useWorkspaceStore.setState({ workspaceId: 'ws-leads-1' });
  global.fetch = jest.fn((url, opts = {}) => {
    fetchCalls.push({ url, method: opts.method || 'GET', body: opts.body });
    if (url.includes('/api/sales-leads')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          leads: [
            {
              id: 'lead-101',
              name: 'Apex Innovations',
              status: 'new',
              icp_score: 0.92,
              email: 'info@apex.com',
            },
          ],
        }),
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

test('renders LeadsWindow and toggles scout panel', async () => {
  await act(async () => {
    render(<LeadsWindow />);
  });

  // Verify main heading label and loaded lead item
  expect(screen.getByText('Lead Queue')).toBeTruthy();
  expect(await screen.findByText('Apex Innovations')).toBeTruthy();

  // Click Scout button to open scout panel
  const scoutBtn = screen.getByTitle('Run a scout pass');
  expect(scoutBtn).toBeTruthy();

  await act(async () => {
    fireEvent.click(scoutBtn);
  });

  // Verify scout panel toggled open
  expect(screen.getByPlaceholderText(/Ideal customer/i)).toBeTruthy();
});
