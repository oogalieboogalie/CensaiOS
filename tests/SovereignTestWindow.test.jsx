/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SovereignTestWindow } from '../src/components/SovereignTestWindow.jsx';

function jsonResponse(payload = [], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url, options) => {
    if (url === '/api/sovereignTest') {
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        return jsonResponse({ id: 'rec-1', name: body.name });
      }
      return jsonResponse([
        { id: 'rec-1', name: 'Existing Record' },
      ]);
    }
    return jsonResponse([]);
  });
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('SovereignTestWindow', () => {
  test('renders without throwing, showing title and existing records', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'st1', kind: 'sovereignTest', title: 'SovereignTest Window' };

    await act(async () => {
      render(<SovereignTestWindow win={win} onUpdate={onUpdate} />);
    });

    expect(screen.getByText('SovereignTest Window')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter name...')).toBeInTheDocument();
    expect(screen.getByText(/"Existing Record"/)).toBeInTheDocument();
  });

  test('submitting form sends POST request to /api/sovereignTest', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'st1', kind: 'sovereignTest', title: 'SovereignTest Window' };

    await act(async () => {
      render(<SovereignTestWindow win={win} onUpdate={onUpdate} />);
    });

    const input = screen.getByPlaceholderText('Enter name...');
    const submitBtn = screen.getByRole('button', { name: /submit/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'New Test Record' } });
    });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/sovereignTest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Test Record' }),
    });
  });
});
