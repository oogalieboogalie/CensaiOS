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
  expect(screen.getByLabelText('Who you sell to')).toBeTruthy();
});

test('Draft asks for what you sell before calling the server', async () => {
  await act(async () => {
    render(<LeadsWindow win={{}} onUpdate={jest.fn()} />);
  });
  await screen.findByText('Apex Innovations');
  await act(async () => {
    fireEvent.click(screen.getByTitle('Draft an outreach email for this lead'));
  });
  expect(screen.getByText(/Fill in "What you sell"/)).toBeTruthy();
  expect(screen.getByLabelText('What you sell')).toBeTruthy();
  expect(fetchCalls.some((c) => c.url.includes('/api/scout/draft'))).toBe(false);
});

test('Draft sends the saved business and target', async () => {
  const win = { leadQueue: { business: 'Window cleaning', target: 'Office buildings' } };
  await act(async () => {
    render(<LeadsWindow win={win} onUpdate={jest.fn()} />);
  });
  await screen.findByText('Apex Innovations');
  await act(async () => {
    fireEvent.click(screen.getByTitle('Draft an outreach email for this lead'));
  });
  const call = fetchCalls.find((c) => c.url.includes('/api/scout/draft'));
  expect(JSON.parse(call.body)).toEqual({ lead_id: 'lead-101', business: 'Window cleaning', target: 'Office buildings' });
});
