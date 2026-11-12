/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// tests/tailnetScreens.test.jsx
//
// What a person sees of "My Tailscale devices": the card in Settings with a
// switch per device, the code for a phone or tablet, the sign-in screen that
// lets a switched-on device straight in, and the pop-up that offers another
// copy of censaiOS found on the tailnet.
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const toDataURL = jest.fn(async () => 'data:image/png;base64,TESTQR');
jest.unstable_mockModule('qrcode', () => ({ default: { toDataURL } }));

const { TailnetSection } = await import('../src/components/theme/TailnetSection.jsx');
const { OpenOnMyDevices } = await import('../src/components/theme/OpenOnMyDevices.jsx');
const { TailnetEntry } = await import('../src/components/login/TailnetEntry.jsx');
const { TailnetToasts } = await import('../src/components/TailnetToasts.jsx');
const { boardLinkAt, dismissedCopies, openCopy, whyNotConnected } = await import('../src/lib/tailnet/index.js');

// Made-up Tailscale addresses for two computers.
const OFFICEPC = ['http:', '', '100.101.1.1:3004'].join('/');
const HOMEBOX = ['http:', '', '100.101.1.5:3004'].join('/');

const CARD = {
  usable: true, on: true, connected: true, reason: 'ok', canManage: true, portProblem: '',
  thisComputer: { name: 'officepc' }, address: `${OFFICEPC}`,
  devices: [
    { id: 'nPHONE', name: 'almas-phone', system: 'android', kind: 'phone', online: true, mine: true, owner: 'alma@example.com', shared: false, on: true, here: false },
    { id: 'nLAPTOP', name: 'laptop', system: 'linux', kind: 'computer', online: false, mine: true, owner: 'alma@example.com', shared: false, on: false, here: false },
    { id: 'nSAM', name: 'sams-mac', system: 'macOS', kind: 'computer', online: true, mine: false, owner: 'sam@example.com', shared: false, on: false, here: false },
  ],
};

let answers;
let calls;
// Lets the page finish reading its answer before the test looks at it.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
function answer(path, body, status = 200) { answers[path] = { body, status }; }

beforeEach(() => {
  answers = {};
  calls = [];
  toDataURL.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  global.fetch = jest.fn(async (url, options = {}) => {
    const path = String(url).replace('/api/web-os/tailnet', '') || '/';
    calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    const found = answers[`${options.method || 'GET'} ${path}`] || answers[path] || { body: { error: 'Not found.' }, status: 404 };
    return { ok: found.status < 400, status: found.status, json: async () => found.body };
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('the card in Settings', () => {
  test('lists each device with its own switch, and says whose a stranger\'s device is', async () => {
    answer('/', CARD);
    answer('/nearby', { copies: [] });
    render(<TailnetSection />);
    expect(await screen.findByText('My Tailscale devices')).toBeInTheDocument();
    expect(screen.getAllByTestId('tailnet-device')).toHaveLength(3);
    expect(screen.getByRole('switch', { name: 'Let almas-phone open censaiOS' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Let laptop open censaiOS' })).not.toBeChecked();
    expect(screen.getByText('Android · on now')).toBeInTheDocument();
    expect(screen.getByText('Linux · off right now')).toBeInTheDocument();
    expect(screen.getByText('Signed in to Tailscale as sam@example.com.')).toBeInTheDocument();
    expect(screen.getByText(/1 device is switched on/)).toBeInTheDocument();
  });

  test('switching a device on saves just that device', async () => {
    answer('/', CARD);
    answer('PUT /', { ...CARD, devices: CARD.devices.map((d) => (d.id === 'nLAPTOP' ? { ...d, on: true } : d)) });
    render(<TailnetSection />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Let laptop open censaiOS' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Let laptop open censaiOS' })).toBeChecked());
    expect(calls.find((c) => c.method === 'PUT').body).toEqual({ devices: { nLAPTOP: true } });
    expect(screen.getByText(/2 devices are switched on/)).toBeInTheDocument();
  });

  test('someone else\'s device asks first, and stays off on "Cancel"', async () => {
    answer('/', CARD);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TailnetSection />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Let sams-mac open censaiOS' }));
    expect(confirm.mock.calls[0][0]).toContain('sam@example.com');
    expect(confirm.mock.calls[0][0]).toContain('as you');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  test('the code for a phone or tablet is this computer\'s Tailscale address, with nothing secret in it', async () => {
    answer('/', CARD);
    render(<TailnetSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open on a phone or tablet' }));
    expect(await screen.findByAltText('Code to scan with your phone or tablet')).toBeInTheDocument();
    expect(toDataURL.mock.calls[0][0]).toBe(`${OFFICEPC}/`);
    expect(screen.getByTestId('tailnet-phone-link')).toHaveTextContent(`${OFFICEPC}/`);
  });

  test('says in plain words why devices can\'t be listed', async () => {
    answer('/', { ...CARD, connected: false, reason: 'needs-feed', devices: [] });
    render(<TailnetSection />);
    expect(await screen.findByTestId('tailnet-not-connected')).toHaveTextContent('bash scripts/home-server-tailnet.sh');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(whyNotConnected('not-installed')).toContain('tailscale.com');
    expect(whyNotConnected('docker-desktop')).toContain('desktop app');
    expect(whyNotConnected('signed-out')).toContain('sign in');
  });

  test('shows nothing to a teammate, or on a copy with its own web address', async () => {
    for (const body of [{ usable: true, canManage: false, on: false, devices: [] }, { usable: false }, { available: true, open: true }]) {
      answer('/', body);
      const { container } = render(<TailnetSection />);
      await settle();
      expect(global.fetch).toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  test('a port problem is said out loud', async () => {
    answer('/', { ...CARD, portProblem: 'port-busy', address: '' });
    render(<TailnetSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Another program on this computer');
    expect(screen.queryByRole('button', { name: 'Open on a phone or tablet' })).toBeNull();
  });
});

describe('the Share panel', () => {
  test('the code opens this exact board', async () => {
    answer('/', CARD);
    render(<OpenOnMyDevices workspaceId="family-board" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open on my phone or tablet' }));
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(toDataURL.mock.calls[0][0]).toBe(`${OFFICEPC}/?workspace=family-board`);
    expect(boardLinkAt(`${OFFICEPC}/`, 'family-board')).toBe(`${OFFICEPC}/?workspace=family-board`);
    expect(boardLinkAt('', 'family-board')).toBe('');
  });

  test('points at Settings while the switch is off, and stays out of the way without Tailscale', async () => {
    answer('/', { ...CARD, on: false });
    render(<OpenOnMyDevices workspaceId="family-board" />);
    expect(await screen.findByText(/Turn it on in Settings/)).toBeInTheDocument();
    cleanup();
    answer('/', { ...CARD, connected: false });
    const { container } = render(<OpenOnMyDevices workspaceId="family-board" />);
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the sign-in screen on another device', () => {
  const codeForm = <div data-testid="code-form">code form</div>;

  test('a switched-on device is signed in with nothing to type', async () => {
    answer('/hello', { app: 'censaiOS', name: 'officepc', device: 'almas-phone', admitted: true });
    answer('POST /enter', { ok: true });
    const done = jest.fn();
    render(<TailnetEntry onLoginSuccess={done}>{codeForm}</TailnetEntry>);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('code-form')).toBeNull();
  });

  test('after signing out on purpose, the device is asked, not signed straight back in', async () => {
    answer('/hello', { app: 'censaiOS', name: 'officepc', device: 'almas-phone', admitted: true });
    answer('POST /enter', { ok: true });
    const done = jest.fn();
    render(<TailnetEntry onLoginSuccess={done}>{codeForm}</TailnetEntry>);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    cleanup();
    // The sign-in screen shows again in the same tab: the person signed out.
    render(<TailnetEntry onLoginSuccess={done}>{codeForm}</TailnetEntry>);
    const button = await screen.findByRole('button', { name: 'Open my board' });
    expect(done).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(2));
  });

  test('a device that is not switched on gets the code form and is told what to switch on', async () => {
    answer('/hello', { app: 'censaiOS', name: 'officepc', device: 'almas-phone', admitted: false });
    const done = jest.fn();
    render(<TailnetEntry onLoginSuccess={done}>{codeForm}</TailnetEntry>);
    expect(await screen.findByTestId('code-form')).toBeInTheDocument();
    expect(screen.getByTestId('tailnet-entry-hint')).toHaveTextContent('almas-phone');
    expect(calls.some((c) => c.path === '/enter')).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  test('a device that is not on the tailnet just gets the code form', async () => {
    const done = jest.fn();
    render(<TailnetEntry onLoginSuccess={done}>{codeForm}</TailnetEntry>);
    expect(await screen.findByTestId('code-form')).toBeInTheDocument();
    expect(screen.queryByTestId('tailnet-entry-hint')).toBeNull();
  });

  test('a refused sign-in falls back to the code form', async () => {
    answer('/hello', { app: 'censaiOS', device: 'almas-phone', admitted: true });
    answer('POST /enter', { error: 'no' }, 403);
    render(<TailnetEntry onLoginSuccess={jest.fn()}>{codeForm}</TailnetEntry>);
    expect(await screen.findByTestId('code-form')).toBeInTheDocument();
  });
});

describe('another copy of censaiOS on the tailnet', () => {
  const COPY = { id: 'nBOX', name: 'homebox', device: 'homebox', address: `${HOMEBOX}`, ready: true };

  test('the pop-up offers it once, and "Not now" keeps it quiet', async () => {
    answer('/nearby', { copies: [COPY, { ...COPY, id: 'nOTHER', name: 'spare', ready: false }] });
    render(<TailnetToasts />);
    expect(await screen.findByText('homebox')).toBeInTheDocument();
    expect(screen.queryByText('spare')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('homebox')).toBeNull();
    expect(dismissedCopies()).toEqual(['nBOX']);
  });

  test('the board stops asking once the server says nothing can show here', async () => {
    jest.useFakeTimers();
    try {
      answer('/nearby', { copies: [], watching: false });
      render(<TailnetToasts />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      const asked = () => calls.filter((c) => c.path === '/nearby').length;
      expect(asked()).toBe(1);
      await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000); });
      expect(asked()).toBe(1);
      cleanup();

      // While the switch is on it keeps looking, every two minutes.
      calls = [];
      answer('/nearby', { copies: [], watching: true });
      render(<TailnetToasts />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(4 * 60 * 1000 + 1000); });
      expect(asked()).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });

  test('the installed app switches itself to that computer; a browser opens a tab', async () => {
    const invoke = jest.fn(async (command) => (command === 'server_get' ? { available: true } : { restart: true }));
    expect(await openCopy(COPY, { __TAURI__: { core: { invoke } } })).toBe('desktop');
    expect(invoke).toHaveBeenLastCalledWith('server_save', { mode: 'remote', address: `${HOMEBOX}` });

    const tab = {};
    const open = jest.fn(() => tab);
    expect(await openCopy(COPY, { open, location: { assign: jest.fn() } })).toBe('tab');
    expect(open).toHaveBeenCalledWith(`${HOMEBOX}`, '_blank');
    expect(tab.opener).toBeNull();

    // The PC launcher always opens this computer: it opens a tab instead.
    const launcher = jest.fn(async () => ({ available: false }));
    const openTab = jest.fn(() => ({}));
    expect(await openCopy(COPY, { __TAURI__: { core: { invoke: launcher } }, open: openTab })).toBe('tab');
    expect(launcher).toHaveBeenCalledTimes(1);
  });
});
