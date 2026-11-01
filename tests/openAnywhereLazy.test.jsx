/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const toDataURL = jest.fn(async () => 'data:image/png;base64,TESTQR');

jest.unstable_mockModule('qrcode', () => ({
  default: { toDataURL },
}));

const { api } = await import('../src/lib/api.js');
const { AppearanceWindow } = await import('../src/components/AppearanceWindow.jsx');
const { useWorkspaceStore } = await import('../src/lib/store.js');

beforeEach(() => {
  toDataURL.mockClear();
  useWorkspaceStore.setState({ focusMode: false, penMode: false });
  jest.spyOn(api, 'getThemeCustomPresets').mockResolvedValue([]);
  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    if (target.includes('/api/web-os/pair')) {
      return { ok: true, status: 200, json: async () => ({ code: 'example-code', expiresAt: '2099-01-01T00:00:00Z' }) };
    }
    if (target.includes('/api/web-os')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          open: true,
          canManage: true,
          hosts: ['officepc'],
          port: 3002,
        }),
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('the settings window renders Open anywhere through the lazy QR path', async () => {
  const win = { id: 'w-app', kind: 'appearance', title: 'Settings', settingsTab: 'anywhere' };

  render(<AppearanceWindow win={win} onUpdate={() => {}} workspaceRevision={1} />);

  expect(await screen.findByTestId('open-anywhere')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Add a computer' }));

  const image = await screen.findByRole('img', { name: 'Code to scan with the other device' });
  expect(image).toHaveAttribute('src', 'data:image/png;base64,TESTQR');
  expect(toDataURL).toHaveBeenCalled();
});
