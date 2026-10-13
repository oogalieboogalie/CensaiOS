/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToolchainSettingsWindow } from '../src/components/ToolchainSettingsWindow.jsx';

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const path = String(url);
    if (path.endsWith('/api/sandbox/toolchains')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          tools: [
            {
              id: 'claude',
              label: 'Claude CLI',
              description: 'Anthropic Claude CLI',
              enabled: true,
              command: 'claude',
            },
          ],
          rebuildStatus: 'idle',
        }),
      });
    }
    if (path.endsWith('/api/sandbox/toolchains/detect')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          sandboxRunning: true,
          results: {
            claude: { installed: true, version: '1.0.0' },
          },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });
});

afterEach(cleanup);

test('renders ToolchainSettingsWindow with heading and sandbox status', async () => {
  await act(async () => {
    render(<ToolchainSettingsWindow />);
  });

  expect(screen.getByText('AI coding assistants')).toBeInTheDocument();
  expect(screen.getByText('Install CLI coding tools into your sandbox')).toBeInTheDocument();
});

test('loads tools and clicking Re-check all triggers detection endpoint', async () => {
  await act(async () => {
    render(<ToolchainSettingsWindow />);
  });

  expect(await screen.findByText('Claude CLI')).toBeInTheDocument();
  expect(await screen.findByText('Sandbox running')).toBeInTheDocument();

  const recheckBtn = screen.getByTitle('Re-check all');
  expect(recheckBtn).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(recheckBtn);
  });

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/sandbox/toolchains/detect'),
    expect.objectContaining({ method: 'POST' })
  );
});
