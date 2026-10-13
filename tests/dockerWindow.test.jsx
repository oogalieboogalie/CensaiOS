/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ContainersWindow } from '../src/components/ContainersWindow.jsx';

const container = (over) => ({
  id: over.name.padEnd(64, '0'), shortId: over.name.slice(0, 12), image: 'img:latest', command: '', status: 'Up 1 hour',
  state: 'running', health: null, ports: [], networks: [], mounts: [], composeProject: null, composeService: null, sandbox: false, ...over,
});

const CONTAINERS = [
  container({ name: 'shop-web-1', composeProject: 'shop', composeService: 'web', health: 'healthy', ports: ['0.0.0.0:8080->80/tcp'] }),
  container({ name: 'shop-db-1', composeProject: 'shop', composeService: 'db', health: 'unhealthy' }),
  container({ name: 'scratch', state: 'exited', status: 'Exited (0) 2 days ago' }),
];

const STATUS_UP = {
  available: true,
  engine: { version: '27.3.1', os: 'Docker Desktop', arch: 'x86_64', cpus: 8, memTotal: 8 * 1024 ** 3 },
  counts: { containers: 3, running: 2, stopped: 1, images: 4 },
  disk: [{ type: 'Images', size: 2_000_000_000, reclaimable: 0 }],
};

function mockApi(status = STATUS_UP) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    const path = String(url).replace(/\?.*$/, '');
    let body = { ok: true };
    if (path === '/api/docker/status') body = status;
    else if (path === '/api/docker/containers') body = { containers: CONTAINERS };
    else if (path === '/api/docker/stats') body = { stats: [{ id: 'shop-web-1', cpu: 12.5, memPercent: 3, memUsed: 50 * 1024 ** 2, memLimit: 8 * 1024 ** 3 }] };
    else if (/\/api\/docker\/containers\/[^/]+$/.test(path)) {
      body = {
        image: 'img:latest', command: 'node server.js', created: '2026-10-04T01:00:00Z', workingDir: '/app',
        state: { running: true, startedAt: '2026-10-04T01:00:00Z', pid: 42 }, health: null, restartPolicy: 'no', restartCount: 0,
        ports: [{ target: '80/tcp', published: ['0.0.0.0:8080'] }], mounts: [], networks: [], env: [{ key: 'API_KEY', value: '••••••', masked: true }],
      };
    } else if (path.endsWith('/logs')) body = { lines: [{ ts: '2026-10-04T01:00:00Z', text: 'listening on :80', stream: 'stdout' }, { ts: '2026-10-04T01:00:01Z', text: 'db timeout', stream: 'stderr' }] };
    return { ok: true, status: 200, json: async () => body };
  });
  return calls;
}

async function renderWindow() {
  render(<ContainersWindow win={{ id: 'w1', title: 'Docker' }} />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

test('explains when the Docker engine is not running', async () => {
  mockApi({ available: false, reason: 'daemon-down', message: 'Cannot connect to the Docker daemon' });
  await renderWindow();
  expect(await screen.findByText('Docker engine isn\'t running')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
});

test('shows the engine, groups containers by compose project and filters', async () => {
  mockApi();
  await renderWindow();
  expect(await screen.findByText('Engine running')).toBeTruthy();
  expect(screen.getByText(/v27\.3\.1/)).toBeTruthy();
  expect(screen.getByText('shop')).toBeTruthy();
  expect(screen.getByText('Standalone')).toBeTruthy();
  expect(screen.getByText('8080→80')).toBeTruthy();
  expect(screen.getByText('unhealthy')).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: /Stopped/ }));
  expect(screen.queryByText('web')).toBeNull();
  expect(screen.getByText('scratch')).toBeTruthy();
});

test('opening a container shows live logs with stderr marked', async () => {
  mockApi();
  await renderWindow();
  fireEvent.click(await screen.findByText('web'));
  const detail = await screen.findByRole('complementary', { name: 'shop-web-1 details' });
  expect(await within(detail).findByText('listening on :80')).toBeTruthy();
  expect(within(detail).getByText('db timeout').closest('.dk-logline').className).toContain('is-err');
});

test('stop and remove ask in an in-window dialog first', async () => {
  const calls = mockApi();
  await renderWindow();
  const row = (await screen.findByText('web')).closest('.dk-row');
  fireEvent.click(within(row).getByRole('button', { name: 'Stop' }));
  const stopDialog = await screen.findByRole('alertdialog');
  expect(within(stopDialog).getByText('Stop shop-web-1?')).toBeTruthy();
  expect(calls.some((c) => c.url.endsWith('/stop'))).toBe(false);
  await act(async () => { fireEvent.click(within(stopDialog).getByRole('button', { name: 'Stop' })); });
  expect(calls).toContainEqual({ url: `/api/docker/containers/${CONTAINERS[0].id}/stop`, method: 'POST' });

  // Esc cancels without acting.
  fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
  fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
  const rmDialog = await screen.findByRole('alertdialog');
  expect(within(rmDialog).getByText(/Named volumes are kept/)).toBeTruthy();
  await act(async () => { fireEvent.click(within(rmDialog).getByRole('button', { name: 'Stop and remove' })); });
  expect(calls.some((c) => c.method === 'DELETE' && c.url.includes(CONTAINERS[0].id))).toBe(true);
});

test('keyboard: arrows move, Enter opens, pane keys switch, Esc steps back, / searches', async () => {
  mockApi();
  await renderWindow();
  await screen.findByText('web');
  const root = document.querySelector('.dk-root');
  fireEvent.keyDown(root, { key: 'ArrowDown' });
  fireEvent.keyDown(root, { key: 'ArrowDown' });
  // Running containers sort first inside a project: db, web, then scratch.
  expect(document.querySelector('.dk-row.is-cursor').textContent).toContain('web');
  fireEvent.keyDown(root, { key: 'Enter' });
  expect(await screen.findByRole('complementary', { name: 'shop-web-1 details' })).toBeTruthy();
  fireEvent.keyDown(root, { key: 'i' });
  expect(screen.getByRole('tab', { name: /Inspect/ }).getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(root, { key: 'ArrowUp' });
  expect(await screen.findByRole('complementary', { name: 'shop-db-1 details' })).toBeTruthy();
  fireEvent.keyDown(root, { key: 'Escape' });
  expect(screen.queryByRole('complementary')).toBeNull();
  fireEvent.keyDown(root, { key: '/' });
  expect(document.activeElement).toBe(screen.getByLabelText('Search containers'));
});

test('logs sort lines by level and keep counting while paused', async () => {
  mockApi();
  await renderWindow();
  fireEvent.click(await screen.findByText('web'));
  const detail = await screen.findByRole('complementary', { name: 'shop-web-1 details' });
  await within(detail).findByText('listening on :80');
  fireEvent.click(within(detail).getByRole('tab', { name: /Errors/ }));
  expect(within(detail).queryByText('listening on :80')).toBeNull();
  expect(within(detail).getByText('db timeout')).toBeTruthy();
  fireEvent.click(within(detail).getByRole('button', { name: 'Live' }));
  expect(within(detail).getByRole('button', { name: /Resume/ })).toBeTruthy();
});

test('Needs attention counts unhealthy and crashed containers the same everywhere', async () => {
  mockApi();
  await renderWindow();
  await screen.findByText('web');
  expect(screen.getByRole('tab', { name: /Needs attention/ }).textContent).toContain('1');
  expect(screen.getByText('Attention').previousSibling.textContent).toBe('1');
});
