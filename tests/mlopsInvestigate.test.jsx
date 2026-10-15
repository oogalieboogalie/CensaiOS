/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MlopsDashboardWindow } from '../src/components/MlopsDashboardWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const model = { id: 'dep-1', data: { modelName: 'Pricer', version: 2, lastDriftScore: 3.1, thresholds: { driftScore: 2 } } };
const alert = {
  id: 'al-1',
  created_at: new Date().toISOString(),
  data: { maxDrift: 3.1, driftResults: { price: { score: 3.1, value: 90, baselineMean: 50 }, age: { score: 0.4, value: 31, baselineMean: 30 } } },
};

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws-ml' });
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => (url.includes('/alerts') ? [alert] : [model]),
  }));
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

test('Investigate opens the per-input drift breakdown, worst first', async () => {
  await act(async () => {
    render(<MlopsDashboardWindow win={{}} onUpdate={jest.fn()} />);
  });
  await act(async () => {
    fireEvent.click(await screen.findByText('Pricer'));
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Investigate' }));
  });
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0].textContent).toContain('price');
  expect(rows[1].textContent).toContain('age');
  expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
});
