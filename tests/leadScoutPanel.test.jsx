/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ScoutPanel } from '../src/components/leads/ScoutPanel.jsx';

describe('ScoutPanel', () => {
  test('runs a scout pass and notifies the queue on success', async () => {
    const onScouted = jest.fn();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ area: 'Waverly, IA', leads: [{ id: 1 }], actionsUsed: 2 }),
    }));
    const settings = { business: 'Bookkeeping', target: 'dental offices' };
    render(React.createElement(ScoutPanel, { workspaceId: 'ws-1', onScouted, settings }));

    fireEvent.change(screen.getByPlaceholderText(/Area/), { target: { value: 'Waverly, IA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(onScouted).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/scout/run?workspaceId=ws-1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      area: 'Waverly, IA', target: 'dental offices', business: 'Bookkeeping', topK: 3,
    });
    expect(await screen.findByText(/1 lead banked/)).toBeInTheDocument();
  });

  test('Run stays disabled until an area is entered', () => {
    render(React.createElement(ScoutPanel, { workspaceId: 'ws-1', onScouted: jest.fn(), settings: { target: 'dental offices' } }));
    expect(screen.getByRole('button', { name: 'Run' }).disabled).toBe(true);
  });

  test('Run stays disabled until you say who you sell to', () => {
    render(React.createElement(ScoutPanel, { workspaceId: 'ws-1', onScouted: jest.fn() }));
    fireEvent.change(screen.getByPlaceholderText(/Area/), { target: { value: 'Waverly, IA' } });
    expect(screen.getByRole('button', { name: 'Run' }).disabled).toBe(true);
  });

  test('typing what you sell saves it to the queue settings', () => {
    const onSettings = jest.fn();
    render(React.createElement(ScoutPanel, { workspaceId: 'ws-1', onScouted: jest.fn(), settings: { target: 'cafes' }, onSettings }));
    fireEvent.change(screen.getByLabelText('What you sell'), { target: { value: 'Espresso machines' } });
    expect(onSettings).toHaveBeenCalledWith({ target: 'cafes', business: 'Espresso machines' });
  });

  test('shows the server error without notifying on failure', async () => {
    const onScouted = jest.fn();
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'TAVILY_API_KEY not configured in .env' }),
    }));
    render(React.createElement(ScoutPanel, { workspaceId: 'ws-1', onScouted, settings: { target: 'cafes' } }));

    fireEvent.change(screen.getByPlaceholderText(/Area/), { target: { value: 'Waverly, IA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(/TAVILY_API_KEY/)).toBeInTheDocument();
    expect(onScouted).not.toHaveBeenCalled();
  });
});
