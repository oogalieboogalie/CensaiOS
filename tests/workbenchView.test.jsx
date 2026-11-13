/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { isWorkbenchView, terminalView, PLAIN_VIEW, WORKBENCH_VIEW } from '../src/components/terminal/workbenchMode.js';

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
  FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
}));

jest.unstable_mockModule('@xterm/addon-clipboard', () => ({
  ClipboardAddon: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule('@xterm/addon-web-links', () => ({
  WebLinksAddon: jest.fn().mockImplementation(() => ({})),
}));

const { Terminal } = await import('@xterm/xterm');
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
    MockWebSocket.urls.push(String(url));
  }
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}
MockWebSocket.urls = [];

beforeEach(() => {
  MockWebSocket.urls = [];
  global.WebSocket = MockWebSocket;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
  useWorkspaceStore.setState({ workspaceId: 'ws-test-1' });
  Terminal.mockClear();
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('a window with no view chosen is the plain terminal', () => {
  expect(terminalView({})).toBe(PLAIN_VIEW);
  expect(terminalView({ terminalView: 'somewhere-else' })).toBe(PLAIN_VIEW);
  expect(isWorkbenchView({ terminalView: WORKBENCH_VIEW })).toBe(true);
  expect(isWorkbenchView({ terminalView: PLAIN_VIEW })).toBe(false);
});

test('the header switches views without opening a new shell', async () => {
  const onUpdate = jest.fn();
  const win = {
    id: 'term-1',
    title: 'Terminal',
    cwd: '/app',
    terminalTabs: [{ id: 'main' }, { id: 'other' }],
    activeTerminalTab: 'main',
  };

  let view;
  await act(async () => {
    view = render(<TerminalWindow win={win} onUpdate={onUpdate} />);
  });

  const workbench = screen.getByRole('button', { name: 'Workbench' });
  const plain = screen.getByRole('button', { name: 'Plain terminal' });
  expect(screen.getByRole('menuitem', { name: 'Glow look: off' })).toBeTruthy();
  expect(plain.getAttribute('aria-pressed')).toBe('true');
  expect(workbench.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText(/same session as the plain terminal/)).toBeNull();
  expect(document.querySelector('[data-terminal-session]').style.display).toBe('flex');

  const shells = Terminal.mock.calls.length;
  const sockets = MockWebSocket.urls.length;
  expect(shells).toBe(2);
  expect(document.querySelectorAll('[data-terminal-tab]')).toHaveLength(2);
  const active = () => Terminal.mock.results[0].value;
  const focused = () => active().focus.mock.calls.length;
  const focusedAtStart = focused();

  await act(async () => { fireEvent.click(plain); });
  expect(onUpdate).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(workbench); });
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith({ terminalView: WORKBENCH_VIEW });

  await act(async () => {
    view.rerender(<TerminalWindow win={{ ...win, terminalView: WORKBENCH_VIEW }} onUpdate={onUpdate} />);
  });

  expect(screen.getByRole('button', { name: 'Workbench' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Plain terminal' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByText(/same session as the plain terminal/)).toBeTruthy();
  expect(document.querySelector('[data-terminal-session]').style.display).toBe('none');
  expect(document.querySelectorAll('[data-terminal-tab]')).toHaveLength(2);
  expect(Terminal.mock.calls.length).toBe(shells);
  expect(MockWebSocket.urls.length).toBe(sockets);
  expect(focused()).toBe(focusedAtStart);
  for (const result of Terminal.mock.results) expect(result.value.dispose).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Plain terminal' })); });
  expect(onUpdate).toHaveBeenLastCalledWith({ terminalView: PLAIN_VIEW });

  await act(async () => {
    view.rerender(<TerminalWindow win={{ ...win, terminalView: PLAIN_VIEW }} onUpdate={onUpdate} />);
  });

  expect(screen.queryByText(/same session as the plain terminal/)).toBeNull();
  expect(document.querySelector('[data-terminal-session]').style.display).toBe('flex');
  expect(Terminal.mock.calls.length).toBe(shells);
  expect(MockWebSocket.urls.length).toBe(sockets);
  expect(focused()).toBe(focusedAtStart + 1);
});
