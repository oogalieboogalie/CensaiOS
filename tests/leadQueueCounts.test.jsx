/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LeadsWindow } from '../src/components/LeadsWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const COUNTS = { all: 5, new: 3, contacted: 2, qualified: 0, dead: 0 };
const LEADS = [
  { id: 'n1', name: 'Sam Example', status: 'new', icp_score: 0.91 },
  { id: 'n2', name: 'Pat Example', status: 'new', icp_score: 0.84 },
  { id: 'n3', name: 'Riley Example', status: 'new', icp_score: 0.77 },
  { id: 'c1', name: 'Jordan Example', status: 'contacted', icp_score: 0.66 },
  { id: 'c2', name: 'Casey Example', status: 'contacted', icp_score: 0.55 },
];

let listUrls = [];

beforeEach(() => {
  listUrls = [];
  useWorkspaceStore.setState({ workspaceId: 'ws-queue-counts' });
  global.fetch = jest.fn((url) => {
    listUrls.push(String(url));
    const status = new URL(url, 'http://localhost').searchParams.get('status');
    const leads = status ? LEADS.filter((lead) => lead.status === status) : LEADS;
    return Promise.resolve({
      ok: true,
      json: async () => ({ leads, counts: COUNTS }),
    });
  });
});

afterEach(() => {
  cleanup();
  useWorkspaceStore.setState({ workspaceId: null });
  jest.clearAllMocks();
});

function expectBoardCounts() {
  expect(screen.getByRole('button', { name: 'all (5)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'new (3)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'contacted (2)' })).toBeTruthy();
}

test('filter buttons keep the whole board counts after picking contacted', async () => {
  await act(async () => {
    render(<LeadsWindow />);
  });
  expectBoardCounts();
  expect(screen.getByText('Sam Example')).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'contacted (2)' }));
  });

  expectBoardCounts();
  expect(screen.queryByText('Sam Example')).toBeNull();
  expect(screen.getByText('Jordan Example')).toBeTruthy();
  expect(screen.getByText('Casey Example')).toBeTruthy();
  expect(listUrls).toHaveLength(2);
  expect(listUrls[1]).toContain('status=contacted');
  expect(listUrls[0]).not.toContain('status=');
});
