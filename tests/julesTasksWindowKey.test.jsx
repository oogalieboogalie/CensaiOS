/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { JulesTasksWindow } from '../src/components/JulesTasksWindow.jsx';

function mockFetch(sessionsBody) {
  global.fetch = jest.fn(async (url) => {
    if (url.startsWith('/api/jules/sessions')) return { ok: true, json: async () => sessionsBody };
    return { ok: false, json: async () => ({ error: 'no queue file' }) };
  });
}

afterEach(() => {
  cleanup();
  delete global.fetch;
});

test('says plainly that a Jules key is needed and where to add it', async () => {
  mockFetch({ sessions: [], canRefreshRemote: false });
  await act(async () => {
    render(<JulesTasksWindow win={{}} />);
  });
  expect(screen.getByText('Jules needs an API key.')).toBeTruthy();
  expect(screen.getByText(/JULES_API_KEY=your key to the \.env file/)).toBeTruthy();
  expect(screen.queryByText('No Jules queue or session data.')).toBeNull();
});

test('with a key and nothing queued, shows the empty note and no key notice', async () => {
  mockFetch({ sessions: [], canRefreshRemote: true });
  await act(async () => {
    render(<JulesTasksWindow win={{}} />);
  });
  expect(screen.queryByText('Jules needs an API key.')).toBeNull();
  expect(screen.getByText('No Jules queue or session data.')).toBeTruthy();
});
