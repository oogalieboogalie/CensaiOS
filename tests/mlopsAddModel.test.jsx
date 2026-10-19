/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MlopsDashboardWindow } from '../src/components/MlopsDashboardWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

let saved;

beforeEach(() => {
  saved = [];
  useWorkspaceStore.setState({ workspaceId: 'ws-ml' });
  global.fetch = jest.fn(async (url, opts = {}) => {
    if (url === '/api/mlops/models' && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      if (!body.modelName.trim()) return { ok: false, json: async () => ({ error: 'Give the model a name.' }) };
      const model = { id: 'dep-9', data: { ...body, version: '1', lastDriftScore: 0, thresholds: { driftScore: 0.1 } } };
      saved = [model];
      return { ok: true, json: async () => model };
    }
    if (url.includes('/alerts')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => saved };
  });
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

test('Add a model saves the name, provider and purpose, then opens the new model', async () => {
  await act(async () => {
    render(<MlopsDashboardWindow win={{}} onUpdate={jest.fn()} />);
  });
  expect(screen.getByText(/No models yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Price predictor' } });
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'Anthropic' } });
  fireEvent.change(screen.getByLabelText('What it is for'), { target: { value: 'Sets shop prices' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
  });
  const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual({ workspaceId: 'ws-ml', modelName: 'Price predictor', provider: 'Anthropic', purpose: 'Sets shop prices' });
  expect(await screen.findByText('Anthropic · Sets shop prices')).toBeInTheDocument();
  expect(screen.getByText('No active alerts')).toBeInTheDocument();
});

test('an empty name is caught before anything is sent', async () => {
  await act(async () => {
    render(<MlopsDashboardWindow win={{}} onUpdate={jest.fn()} />);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Give the model a name.');
  expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
});
