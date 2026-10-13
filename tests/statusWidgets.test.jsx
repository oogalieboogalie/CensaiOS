/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import SystemStatusWidget, { STATUS_TRAY_ID } from '../src/components/status/SystemStatusWidget.jsx';
import { AgentRunToasts } from '../src/components/AgentRunToasts.jsx';

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      host: { uptime_human: '1d 2h 3m', total_mem: 17179869184, free_mem: 8589934592 },
      containers: [],
      now: new Date().toISOString(),
    }),
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('host status docks into the tray instead of covering windows', async () => {
  const { unmount } = render(
    <>
      <div id={STATUS_TRAY_ID} data-testid="tray" />
      <SystemStatusWidget focusMode={false} />
    </>
  );
  await act(async () => { jest.advanceTimersByTime(0); });
  const chip = screen.getByTestId('host-status-chip');
  expect(screen.getByTestId('tray')).toContainElement(chip);
  expect(chip).toHaveTextContent('50%');
  expect(screen.queryByTestId('host-status-float')).toBeNull();

  await act(async () => { fireEvent.click(chip); });
  expect(screen.getByTestId('host-status-panel')).toHaveTextContent('1d 2h 3m');
  unmount();
});

test('host status can float on the canvas and dock back, and remembers it', async () => {
  const { rerender, unmount } = render(
    <>
      <div id={STATUS_TRAY_ID} />
      <SystemStatusWidget focusMode={false} />
    </>
  );
  await act(async () => { jest.advanceTimersByTime(0); });
  await act(async () => { fireEvent.click(screen.getByTestId('host-status-chip')); });
  await act(async () => { fireEvent.click(screen.getByTitle('Float host status on the canvas')); });
  expect(screen.getByTestId('host-status-float')).toBeTruthy();
  expect(window.localStorage.getItem('host-status-placement')).toBe('float');

  await act(async () => { fireEvent.click(screen.getByTitle('Dock host status into the tray')); });
  expect(screen.queryByTestId('host-status-float')).toBeNull();
  expect(window.localStorage.getItem('host-status-placement')).toBe('tray');
  await act(async () => { rerender(<SystemStatusWidget focusMode />); });
  expect(screen.queryByTestId('host-status-chip')).toBeNull();
  unmount();
});

test('agent toast shows the tail with an opener, then dismisses', async () => {
  const onOpenWindow = jest.fn();
  const collaboration = {
    lastAgentRun: {
      prompt: 'Fix the login bug',
      exitCode: 0,
      tail: 'line one\nline two',
      windowId: 'win-9',
      receivedAt: Date.now(),
    },
  };
  render(<AgentRunToasts collaboration={collaboration} onOpenWindow={onOpenWindow} />);

  expect(screen.getByText('Agent finished')).toBeTruthy();
  expect(screen.getByText('Fix the login bug')).toBeTruthy();
  expect(screen.getByText(/line one/)).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByText('Open transcript'));
  });
  expect(onOpenWindow).toHaveBeenCalledWith('win-9');
  expect(screen.queryByText('Agent finished')).toBeNull();
});

test('agent toast stays hidden without a run', () => {
  const { container } = render(<AgentRunToasts collaboration={{}} onOpenWindow={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
