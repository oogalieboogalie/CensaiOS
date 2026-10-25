/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ContainersWindow } from '../src/components/ContainersWindow.jsx';
import { suggestName } from '../src/components/docker/RunImageForm.jsx';

const STATUS_UP = {
  available: true,
  engine: { version: '27.3.1', os: 'Docker Desktop', arch: 'x86_64', cpus: 8, memTotal: 8 * 1024 ** 3 },
  counts: { containers: 0, running: 0, stopped: 0, images: 1 },
  disk: [],
};
const IMAGE = { id: 'sha256:2b5e8a1c4d88', ref: 'axllent/mailpit:latest', repository: 'axllent/mailpit', tag: 'latest', dangling: false, size: 31_500_000, createdSince: '3 months ago', inUseBy: [] };

function mockApi(role) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const path = String(url).replace(/\?.*$/, '');
    let body = { ok: true };
    if (path === '/api/auth/session') body = { authenticated: true, user: { id: 1, role } };
    else if (path === '/api/docker/status') body = STATUS_UP;
    else if (path === '/api/docker/containers') body = { containers: [] };
    else if (path === '/api/docker/images') body = { images: [IMAGE] };
    else if (path === '/api/docker/images/run') body = { ok: true, id: 'abc', name: 'mailpit', ports: ['8025:8025'] };
    return { ok: true, status: 200, json: async () => body };
  });
  return calls;
}

async function openImages() {
  render(<ContainersWindow win={{ id: 'w1', title: 'Docker' }} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(await screen.findByRole('tab', { name: /Images/ }));
  await screen.findByText('axllent/mailpit');
}

test('the computer owner runs an image with a name and a port', async () => {
  const calls = mockApi('admin');
  await openImages();
  fireEvent.click(await screen.findByRole('button', { name: 'Run axllent/mailpit:latest' }));
  expect(screen.getByLabelText('Container name').value).toBe('mailpit');
  fireEvent.change(screen.getByLabelText('Ports'), { target: { value: '8025:8025' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); });
  const sent = calls.find((c) => c.url === '/api/docker/images/run');
  expect(sent).toMatchObject({ method: 'POST', body: { image: 'axllent/mailpit:latest', name: 'mailpit', ports: '8025:8025' } });
  expect(await screen.findByText('Started mailpit on port 8025')).toBeTruthy();
  expect(screen.getByRole('tab', { name: /Containers/ }).getAttribute('aria-selected')).toBe('true');
});

test('More settings sends settings, a shared folder and when to start again', async () => {
  const calls = mockApi('admin');
  await openImages();
  fireEvent.click(await screen.findByRole('button', { name: 'Run axllent/mailpit:latest' }));
  expect(screen.queryByLabelText('Settings')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'More settings' }));
  fireEvent.change(screen.getByLabelText('Settings'), { target: { value: 'MP_MAX_MESSAGES=500\nMP_UI_AUTH=pat:demo' } });
  fireEvent.change(screen.getByLabelText('Folder on this computer'), { target: { value: 'D:\\data\\mail' } });
  fireEvent.change(screen.getByLabelText('Path inside the container'), { target: { value: '/data' } });
  fireEvent.change(screen.getByLabelText('Start it again'), { target: { value: 'unless-stopped' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); });
  const sent = calls.find((c) => c.url === '/api/docker/images/run');
  expect(sent.body).toMatchObject({
    env: 'MP_MAX_MESSAGES=500\nMP_UI_AUTH=pat:demo',
    share: { host: 'D:\\data\\mail', target: '/data' },
    restart: 'unless-stopped',
  });
});

test('a teammate sees no Run button', async () => {
  mockApi('user');
  await openImages();
  expect(screen.queryByRole('button', { name: /^Run / })).toBeNull();
});

test('a name is suggested from the image', () => {
  expect(suggestName('axllent/mailpit')).toBe('mailpit');
  expect(suggestName('ghcr.io/org/my_app')).toBe('my_app');
});
