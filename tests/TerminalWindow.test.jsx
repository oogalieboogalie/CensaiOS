/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

jest.unstable_mockModule('@xterm/xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    writeln: jest.fn(),
    write: jest.fn(),
    onData: jest.fn(() => ({ dispose: jest.fn() })),
    attachCustomKeyEventHandler: jest.fn(),
    onSelectionChange: jest.fn(() => ({ dispose: jest.fn() })),
    getSelection: jest.fn(() => ''),
    dispose: jest.fn(),
    options: {},
    cols: 80,
    rows: 24,
    focus: jest.fn(),
    paste: jest.fn(),
  })),
}));

jest.unstable_mockModule('@xterm/addon-fit', () => ({
  FitAddon: jest.fn().mockImplementation(() => ({
    fit: jest.fn(),
  })),
}));

jest.unstable_mockModule('@xterm/addon-clipboard', () => ({
  ClipboardAddon: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule('@xterm/addon-web-links', () => ({
  WebLinksAddon: jest.fn().mockImplementation(() => ({})),
}));

const { TerminalWindow } = await import('../src/components/TerminalWindow.jsx');
const { useWorkspaceStore } = await import('../src/lib/store.js');

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
  }
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}

beforeEach(() => {
  global.WebSocket = MockWebSocket;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  useWorkspaceStore.setState({ workspaceId: 'ws-test-1' });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('renders TerminalWindow and triggers an agent run task', async () => {
  const onUpdate = jest.fn();
  const win = { id: 'term-1', title: 'Terminal', cwd: '/app' };

  await act(async () => {
    render(<TerminalWindow win={win} onUpdate={onUpdate} />);
  });

  // Verify title / main header element rendered
  expect(screen.getByText('Terminal')).toBeTruthy();

  // Click the Agent run button in toolbar
  const agentButton = screen.getByText('▶ Run agent');
  await act(async () => {
    fireEvent.click(agentButton);
  });

  // AgentRunBar should appear with input
  const input = screen.getByPlaceholderText(/Ask the agent to do something/i);
  expect(input).toBeTruthy();

  // Type task prompt and click Run button
  fireEvent.change(input, { target: { value: 'run tests and fix lint' } });
  const runBtn = screen.getByRole('button', { name: 'Run' });
  await act(async () => {
    fireEvent.click(runBtn);
  });

  // Verify onUpdate was called with updated title and agentRun object
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Agent · run tests and fix lint',
      agentRun: { prompt: 'run tests and fix lint' },
      agentSessionId: expect.any(String),
    })
  );
});
