/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { DevServerWindow } from '../src/components/DevServerWindow.jsx';
import { parseUrl } from '../src/components/BrowserWindow.jsx';

const NAME = 'censai-dev-shop-0123456789';

function mockApi({ listError = null, phases = ['installing', 'ready'], role = 'admin' } = {}) {
  const calls = [];
  let step = 0;
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url: String(url), method, body: opts.body ? JSON.parse(opts.body) : null });
    const path = String(url).replace(/\?.*$/, '');
    if (path === '/api/auth/session') return { ok: true, status: 200, json: async () => ({ user: { id: role === 'admin' ? 1 : 2, role } }) };
    if (path === '/api/dev-servers' && method === 'GET') {
      if (listError) return { ok: false, status: 503, json: async () => listError };
      return { ok: true, status: 200, json: async () => ({ servers: [], defaults: { image: 'node:22-bookworm-slim', port: 3000 } }) };
    }
    if (path === '/api/dev-servers' && method === 'POST') return { ok: true, status: 200, json: async () => ({ name: NAME, folder: 'D:\\Sites\\shop' }) };
    if (path === `/api/dev-servers/${NAME}`) {
      const phase = phases[Math.min(step++, phases.length - 1)];
      return { ok: true, status: 200, json: async () => ({ name: NAME, phase, url: phase === 'ready' ? 'http://localhost:49200' : null }) };
    }
    if (path.endsWith('/logs')) return { ok: true, status: 200, json: async () => ({ lines: [{ ts: '2026-10-10T20:00:00Z', text: 'VITE ready', stream: 'stdout' }] }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  return calls;
}

function Harness({ initial, onSpawn }) {
  const [win, setWin] = React.useState(initial);
  return <DevServerWindow win={win} onUpdate={(p) => setWin((w) => ({ ...w, ...p }))} onSpawn={onSpawn} currentProject={null} />;
}

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

afterEach(() => { jest.useRealTimers(); });

describe('Run dev window', () => {
  test('Run dev starts the folder and opens the site in a Browser window once it answers', async () => {
    const calls = mockApi();
    const onSpawn = jest.fn();
    render(<Harness initial={{ id: 'w1' }} onSpawn={onSpawn} />);
    await settle();
    fireEvent.change(screen.getByLabelText('Project folder'), { target: { value: 'D:\\Sites\\shop' } });
    fireEvent.click(screen.getByRole('button', { name: /Run dev/ }));
    await settle();
    expect(calls.find((c) => c.method === 'POST' && c.url === '/api/dev-servers').body).toMatchObject({ folder: 'D:\\Sites\\shop' });
    expect(calls.some((c) => c.url === '/api/dev-servers/heartbeat')).toBe(true);
    await settle(1700);
    expect(screen.getByText(/Running at/)).toBeTruthy();
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(onSpawn).toHaveBeenCalledWith('browser', { url: 'http://localhost:49200', title: 'shop' });
    await settle(50);
    expect(onSpawn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Stop and remove/ }));
    await settle();
    expect(calls.some((c) => c.method === 'DELETE' && c.url === `/api/dev-servers/${NAME}`)).toBe(true);
    // A stale "ready" must not open a second Browser after Stop.
    await settle(50);
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  test('opened from Project files it starts on its own', async () => {
    const calls = mockApi();
    render(<Harness initial={{ id: 'w2', folder: '/workspace/CensaiHub', autoStart: true }} onSpawn={jest.fn()} />);
    await settle();
    await settle();
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/dev-servers')).toHaveLength(1);
  });

  test('without Docker it says so plainly', async () => {
    mockApi({ listError: { error: 'Cannot connect to the Docker daemon', reason: 'daemon-down' } });
    render(<Harness initial={{ id: 'w3' }} onSpawn={jest.fn()} />);
    await settle();
    expect(screen.getByText(/engine isn't running/)).toBeTruthy();
    expect(screen.getByText(/Run dev needs Docker Desktop/)).toBeTruthy();
  });

  test('when the app cannot reach Docker at all it names the one-time setup change', async () => {
    mockApi({ listError: { error: 'Runner error: fetch failed', reason: 'runner-unreachable' } });
    render(<Harness initial={{ id: 'w4' }} onSpawn={jest.fn()} />);
    await settle();
    expect(screen.getByText(/one-time Docker setup change on the PC/)).toBeTruthy();
  });
});

describe('Browser address bar', () => {
  test('local dev addresses open as pages, not searches', () => {
    expect(parseUrl('localhost:5173')).toBe('http://localhost:5173');
    expect(parseUrl('127.0.0.1:3000/shop')).toBe('http://127.0.0.1:3000/shop');
    expect(parseUrl('http://localhost:49200')).toBe('http://localhost:49200');
    expect(parseUrl('best pizza')).toMatch(/duckduckgo/);
  });

  test('a teammate reads that only the owner can start or stop it, and sends no keep-alive', async () => {
    const calls = mockApi({ role: 'member' });
    render(<Harness initial={{ id: 'w2', devName: NAME, folder: 'D:\\Sites\\shop' }} onSpawn={jest.fn()} />);
    await settle();
    expect(screen.getByTestId('run-dev-owner-only').textContent).toMatch(/Only this computer.s owner can start or stop Run dev/);
    expect(screen.queryByRole('button', { name: /^Run dev$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Stop and remove/ })).toBeNull();
    expect(calls.some((c) => c.url === '/api/dev-servers/heartbeat')).toBe(false);
  });
});
