/**
 * @jest-environment jsdom
 */
import fs from 'node:fs';
import path from 'node:path';
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
const { WindowProjectChip } = await import('../src/components/windows/WindowProjectChip.jsx');

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

  // One header, no second bar: "Run an agent here…" lives in the header's menu.
  expect(screen.queryByText('▶ Run agent')).toBeNull();
  expect(screen.queryByText('Mount to')).toBeNull();
  const agentButton = screen.getByText('Run an agent here…');
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

test('a long folder name ellipsizes and the chip title is the full name', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/window-chrome.css'), 'utf8');
  expect(css).toMatch(/\.hb-win-project-name \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
  expect(css).toMatch(/\.hb-win-project-chip \{[^}]*overflow: hidden;/);
});

test('"Mount to" opens a folder picker and mounts the terminal to the picked folder', async () => {
  const onUpdate = jest.fn();
  const win = { id: 'term-2', kind: 'terminal', title: 'Terminal', cwd: '/workspace/projects' };
  const listing = {
    places: [{ name: 'Projects folder', path: '/workspace/projects', mountPath: 'D:\\Projects' }],
    path: '/workspace/projects', mountPath: 'D:\\Projects', name: 'Projects folder', parent: null,
    folders: [{ name: 'shop', path: '/workspace/projects/shop', mountPath: 'D:\\Projects\\shop' }],
  };
  const shop = { ...listing, path: '/workspace/projects/shop', mountPath: 'D:\\Projects\\shop', name: 'shop', parent: '/workspace/projects', folders: [] };
  global.fetch = jest.fn(async (url, opts) => {
    if (String(url).startsWith('/api/files/folders')) {
      return { ok: true, json: async () => (String(url).includes('shop') ? shop : listing) };
    }
    if (url === '/api/projects/open') {
      const body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ project: { id: 'p1', name: 'shop', path: body.path } }) };
    }
    return { ok: true, json: async () => [] };
  });

  // The terminal's one folder control is the header chip: "Mount to <folder>",
  // and a click opens the picker straight away (no menu, no dropdown).
  await act(async () => { render(<WindowProjectChip win={win} onUpdate={onUpdate} />); });
  expect(screen.getByText('Mount to')).toBeTruthy();
  expect(screen.getByText('projects').getAttribute('title')).toBe('projects');
  expect(screen.getByTitle(/Mount to projects\./)).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByTitle(/Click to mount it to another folder/)); });
  expect(screen.queryByRole('menu')).toBeNull();
  await act(async () => { fireEvent.click(await screen.findByText('shop')); });
  await screen.findByText('D:\\Projects\\shop');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mount here' })); });

  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
    cwd: 'D:\\Projects\\shop',
    title: 'Terminal · shop',
  }));
});
