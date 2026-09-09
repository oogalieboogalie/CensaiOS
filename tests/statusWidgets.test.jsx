/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import SystemStatusWidget from '../src/components/status/SystemStatusWidget.jsx';
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

test('host status minimizes to a header chip and remembers it', async () => {
  const { rerender } = render(<SystemStatusWidget focusMode={false} />);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(screen.getByText('Host Status')).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByTitle('Minimize host status'));
  });
  expect(screen.queryByText('Loading...')).toBeNull();
  expect(window.localStorage.getItem('host-status-min')).toBe('1');

  rerender(<SystemStatusWidget focusMode={false} />);
  expect(screen.queryByText('Loading...')).toBeNull();
  expect(screen.getByTitle('Expand host status')).toBeTruthy();
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
