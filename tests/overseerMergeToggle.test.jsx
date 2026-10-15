/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OverseerWindow } from '../src/components/OverseerWindow.jsx';

let posts = [];
window.HTMLElement.prototype.scrollIntoView = () => {};
beforeEach(() => {
  posts = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') posts.push({ url, body: JSON.parse(opts.body || '{}') });
    if (url === '/api/overseer/status' || opts.method === 'POST') {
      return { ok: true, json: async () => ({ isRunning: false, isAuditing: false, countdown: 3600, intervalSeconds: 3600, repo: '', logs: '', lastRunStatus: 'idle', autoMerge: false }) };
    }
    return { ok: true, json: async () => [] };
  });
});
afterEach(() => {
  cleanup();
  delete global.fetch;
});

test('says it runs Jules and merges nothing until the user turns merging on', async () => {
  await act(async () => {
    render(<OverseerWindow win={{}} />);
  });
  const box = screen.getByLabelText('Merge pull requests that pass their checks');
  expect(box.checked).toBe(false);
  expect(screen.getByText(/Off: nothing is merged/)).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText('owner/repo'), { target: { value: 'me/app' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Start Watcher/ }));
  });
  expect(posts[0]).toEqual({ url: '/api/overseer/start', body: { repo: 'me/app', intervalSeconds: 3600, autoMerge: false } });

  fireEvent.click(box);
  expect(screen.getByText(/On: ready pull requests are merged/)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Run Now/ }));
  });
  expect(posts[1]).toEqual({ url: '/api/overseer/run', body: { autoMerge: true } });
});
