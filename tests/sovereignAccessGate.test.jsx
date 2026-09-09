/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockApi = {
  getUserKeys: jest.fn(),
  setUserKey: jest.fn(),
  logout: jest.fn(),
};

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: mockApi,
}));

const { SovereignAccessGate } = await import('../src/components/SovereignAccessGate.jsx');

describe('SovereignAccessGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('unlocks immediately when the user already has a key', async () => {
    const onConfigured = jest.fn();
    mockApi.getUserKeys.mockResolvedValue([{ provider: 'openrouter', hasKey: true }]);

    render(React.createElement(SovereignAccessGate, { onConfigured }));

    await waitFor(() => expect(onConfigured).toHaveBeenCalledTimes(1));
    expect(mockApi.setUserKey).not.toHaveBeenCalled();
  });

  test('stores a selected provider key and unlocks the canvas', async () => {
    const onConfigured = jest.fn();
    mockApi.getUserKeys.mockResolvedValue([]);
    mockApi.setUserKey.mockResolvedValue({ ok: true, provider: 'google' });

    render(React.createElement(SovereignAccessGate, { onConfigured }));

    const provider = await screen.findByLabelText('Provider');
    await waitFor(() => expect(provider).not.toBeDisabled());
    fireEvent.change(provider, { target: { value: 'google' } });
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: '  personal-google-key  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save key and open canvas' }));

    await waitFor(() => {
      expect(mockApi.setUserKey).toHaveBeenCalledWith('google', 'personal-google-key');
      expect(onConfigured).toHaveBeenCalledTimes(1);
    });
  });

  test('offers Cohere as a personal provider', async () => {
    mockApi.getUserKeys.mockResolvedValue([]);

    render(React.createElement(SovereignAccessGate, { onConfigured: jest.fn() }));

    const provider = await screen.findByLabelText('Provider');
    await waitFor(() => expect(provider).not.toBeDisabled());
    expect(screen.getByRole('option', { name: 'Cohere' })).toHaveValue('cohere');
  });
});
