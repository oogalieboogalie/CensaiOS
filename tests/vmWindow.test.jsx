/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import {
  EXPOSE_HELP, PASSWORD_KEY, addressLabel, blockedReason, describeDrop, keysymsFor, normalizeAddress,
  parseAddress, readSavedPassword, savePassword, vmRecord, wsUrl,
} from '../src/lib/vm/vmAddress.js';
import { VmWindow } from '../src/components/windows/vm/index.jsx';
import { keyboardClaimed, releaseKeyboard } from '../src/lib/keyboardClaim.js';
import { emitBoardEvent } from '../src/lib/collaboration/boardEvents.js';
import { getCollaborationClientId } from '../src/lib/collaboration/clientIdentity.js';
import { resetLivePresenceSenders, setLivePresenceSenders } from '../src/lib/collaboration/liveText.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { startFakeVncServer } from './fixtures/fakeVncServer.js';

// jsdom draws nothing. noVNC only needs a 2D context that takes its calls,
// ImageData, and a ResizeObserver; the pixels themselves don't matter here.
function fakeContext(canvas) {
  return new Proxy({ canvas }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'getImageData' || key === 'createImageData') return (x, y, w = 1, h = 1) => new ImageData(new Uint8ClampedArray(Math.max(1, w * h) * 4), w || 1, h || 1);
      if (key === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}
beforeAll(async () => {
  // noVNC logs refusals with console.error, which this suite treats as a failure.
  const logging = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/@novnc/novnc/core/util/logging.js')).href);
  logging.initLogging('none');
  // noVNC refuses insecure pages loudly; real pages are https or localhost.
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  HTMLCanvasElement.prototype.getContext = function getContext() { this.__ctx ||= fakeContext(this); return this.__ctx; };
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  if (typeof window.ImageData === 'undefined') {
    window.ImageData = class ImageData {
      constructor(data, width, height) { this.data = data; this.width = width; this.height = height ?? data.length / 4 / width; }
    };
    global.ImageData = window.ImageData;
  }
  // jsdom's WebSocket copies sent bytes later; noVNC reuses its send buffer
  // right away. Browsers copy at send(), so do the same here.
  const send = window.WebSocket.prototype.send;
  window.WebSocket.prototype.send = function sendCopy(data) { return send.call(this, ArrayBuffer.isView(data) ? data.slice() : data); };
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    global.ResizeObserver = window.ResizeObserver;
  }
});

afterEach(() => {
  releaseKeyboard();
  resetLivePresenceSenders();
  window.localStorage.clear();
});

describe('VM addresses', () => {
  test('reads host and port, host:port, and whole WebSocket URLs', () => {
    expect(parseAddress({ host: 'localhost', port: '6080' }).address).toEqual({ host: 'localhost', port: 6080, path: '', secure: false });
    expect(parseAddress({ host: '192.168.1.20:5700' }).address).toEqual({ host: '192.168.1.20', port: 5700, path: '', secure: false });
    expect(parseAddress({ host: 'wss://vm.example.com/websockify?token=abc' }).address)
      .toEqual({ host: 'vm.example.com', port: 443, path: 'websockify?token=abc', secure: true });
    expect(parseAddress({ host: 'https://vm.example.com:8443/' }).address).toEqual({ host: 'vm.example.com', port: 8443, path: '', secure: true });
    expect(parseAddress({ host: 'box.lan/websockify', port: 6080 }).address).toEqual({ host: 'box.lan', port: 6080, path: 'websockify', secure: false });
  });

  test('explains what is wrong in plain words', () => {
    expect(parseAddress({ host: '' }).error).toMatch(/address/);
    expect(parseAddress({ host: 'vnc://box:5900' }).error).toMatch(/websockify/);
    expect(parseAddress({ host: 'ftp://box' }).error).toMatch(/ws:\/\//);
    expect(parseAddress({ host: 'box', port: '70000' }).error).toMatch(/port/);
    expect(parseAddress({ host: 'bad host!', port: 6080 }).error).toMatch(/host/);
  });

  test('builds the noVNC URL and a short label', () => {
    expect(wsUrl({ host: 'localhost', port: 6080 })).toBe('ws://localhost:6080/');
    expect(wsUrl({ host: 'vm.example.com', port: 443, path: 'websockify', secure: true })).toBe('wss://vm.example.com/websockify');
    expect(addressLabel({ host: 'box', port: 5700, path: 'x' })).toBe('box:5700/x');
    expect(normalizeAddress({ host: 'nope nope', port: 1 })).toBeNull();
  });

  test('an https page may only reach other computers over wss', () => {
    expect(blockedReason({ host: 'box.lan', port: 6080 }, 'https:')).toMatch(/wss/);
    expect(blockedReason({ host: 'localhost', port: 6080 }, 'https:')).toBeNull();
    expect(blockedReason({ host: 'box.lan', port: 6080, secure: true }, 'https:')).toBeNull();
    expect(blockedReason({ host: 'box.lan', port: 6080 }, 'http:')).toBeNull();
  });

  test('turns drops into one sentence', () => {
    expect(describeDrop({ reason: 'Authentication failed' })).toMatch(/password/);
    expect(describeDrop({ clean: true, wasConnected: true })).toMatch(/closed/);
    expect(describeDrop({ wasConnected: false })).toMatch(/Couldn’t reach/);
  });

  test('the shared record never carries a password', () => {
    const record = vmRecord({ host: 'localhost', port: 6080, password: 'secret', hostClientId: 'c1', hostName: 'Alex', extra: 1 });
    expect(record).toEqual({ host: 'localhost', port: 6080, path: '', secure: false, hostClientId: 'c1', hostName: 'Alex', cast: true });
    expect(JSON.stringify(record)).not.toContain('secret');
  });

  test('passwords are kept per window on this device only', () => {
    savePassword(window.localStorage, 'w1', 'pw1');
    savePassword(window.localStorage, 'w2', 'pw2');
    expect(readSavedPassword(window.localStorage, 'w1')).toBe('pw1');
    savePassword(window.localStorage, 'w1', '');
    expect(readSavedPassword(window.localStorage, 'w1')).toBe('');
    expect(JSON.parse(window.localStorage.getItem(PASSWORD_KEY))).toEqual({ w2: 'pw2' });
  });

  test('typing maps text to X keysyms', () => {
    expect(keysymsFor('Hi\n\té')).toEqual([0x48, 0x69, 0xff0d, 0xff09, 0xe9]);
    expect(keysymsFor('€')).toEqual([0x1000000 + 0x20ac]);
    expect(keysymsFor('a\u0007b')).toEqual([0x61, 0x62]);
  });

  test('the help covers QEMU, websockify and VirtualBox', () => {
    const text = EXPOSE_HELP.map((h) => h.command).join('\n');
    expect(text).toMatch(/-vnc :0,websocket=5700/);
    expect(text).toMatch(/websockify 6080 localhost:5901/);
    expect(text).toMatch(/VBoxManage modifyvm/);
  });
});

describe('VM window registration', () => {
  test('is in the manifest and the Add palette under Build', () => {
    const entry = WINDOW_MANIFESTS.find((m) => m.kind === 'vm');
    expect(entry).toMatchObject({ label: 'Virtual machine', componentName: 'VmWindow' });
    const build = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'Build');
    expect(build.items.map((i) => i.id)).toContain('kind:vm');
  });
});

async function connectTo(server, { password = '' } = {}) {
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: '127.0.0.1' } });
  fireEvent.change(screen.getByLabelText('Port'), { target: { value: String(server.port) } });
  if (password) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

function Harness({ initial = {}, onUpdate }) {
  const [win, setWin] = React.useState({ id: 'vm-1', type: 'vm', ...initial });
  return <VmWindow win={win} onUpdate={(patch) => { onUpdate?.(patch); setWin((w) => ({ ...w, ...patch })); }} />;
}

jest.setTimeout(20000);

describe('VM window against a fake VNC server', () => {
  let server;
  afterEach(async () => { await server?.close(); server = null; });

  test('connects, claims the keyboard, types, and tells teammates who drives', async () => {
    server = await startFakeVncServer({ width: 64, height: 40 });
    const onUpdate = jest.fn();
    const casts = [];
    setLivePresenceSenders({ sendDock: (m) => { casts.push(m); return true; } });
    render(<Harness onUpdate={onUpdate} />);
    expect(screen.getByTestId('vm-connect')).toBeTruthy();
    await connectTo(server);
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('connected'), { timeout: 5000 });
    expect(server.events).toContainEqual({ type: 'init', shared: true });

    const record = onUpdate.mock.calls.at(-1)[0].vm;
    expect(record).toMatchObject({ host: '127.0.0.1', port: server.port, hostClientId: getCollaborationClientId(), cast: true });

    // Teammates get pictures over the dock relay, for this window's slot.
    await waitFor(() => expect(casts.some((c) => c.type === 'dock.cast' && c.windowId === 'vm-1' && c.frame)).toBe(true));

    // The screen takes every key while focused; Shift+Esc gives it back.
    const canvas = screen.getByTestId('vm-screen').querySelector('canvas');
    act(() => { canvas.focus(); });
    expect(keyboardClaimed()).toBe(true);
    expect(screen.getByTestId('vm-hint').textContent).toMatch(/Shift\+Esc/);
    fireEvent.keyDown(canvas, { key: 'Escape', shiftKey: true });
    expect(keyboardClaimed()).toBe(false);

    // Paste: typed key by key, so it works on VMs without a shared clipboard.
    fireEvent.click(screen.getByTitle('Paste into the VM'));
    const box = await screen.findByLabelText('Text for the VM');
    fireEvent.change(box, { target: { value: 'ok\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Type it' }));
    await waitFor(() => expect(server.events.filter((e) => e.type === 'key' && e.down).map((e) => e.keysym)).toEqual([0x6f, 0x6b, 0xff0d]));

    // And the VM clipboard route.
    fireEvent.click(screen.getByTitle('Paste into the VM'));
    fireEvent.change(await screen.findByLabelText('Text for the VM'), { target: { value: 'copied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to VM clipboard' }));
    await waitFor(() => expect(server.events).toContainEqual({ type: 'clipboard', text: 'copied' }));
  });

  test('a dropped VM offers Reconnect, which works', async () => {
    server = await startFakeVncServer({ width: 32, height: 24 });
    const onUpdate = jest.fn();
    render(<Harness onUpdate={onUpdate} />);
    await connectTo(server);
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('connected'), { timeout: 5000 });
    act(() => server.kick());
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('dropped'), { timeout: 5000 });
    expect(screen.getByText('Disconnected')).toBeTruthy();
    expect(onUpdate.mock.calls.at(-1)[0].vm.hostClientId).toBeNull();
    fireEvent.click(screen.getByTitle('Reconnect'));
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('connected'), { timeout: 5000 });
  });

  test('checks the VNC password, and the password never reaches the window record', async () => {
    server = await startFakeVncServer({ width: 32, height: 24, password: 'hunter22' });
    const onUpdate = jest.fn();
    render(<Harness onUpdate={onUpdate} />);
    await connectTo(server, { password: 'wrong' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/password/), { timeout: 5000 });
    expect(server.events).toContainEqual({ type: 'auth', ok: false });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } });
    fireEvent.submit(screen.getByTestId('vm-connect'));
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('connected'), { timeout: 5000 });
    expect(server.events).toContainEqual({ type: 'auth', ok: true });
    expect(JSON.stringify(onUpdate.mock.calls)).not.toContain('hunter22');
    expect(readSavedPassword(window.localStorage, 'vm-1')).toBe('hunter22');
  });

  test('asks for a password when the VM wants one and none was given', async () => {
    server = await startFakeVncServer({ width: 32, height: 24, password: 'pw' });
    render(<Harness />);
    await connectTo(server);
    const field = await screen.findByLabelText('VNC password', undefined, { timeout: 5000 });
    fireEvent.change(field, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.getByTestId('vm').dataset.status).toBe('connected'), { timeout: 5000 });
  });
});

describe('teammates', () => {
  test('watch the driver read-only and can connect from their own computer', async () => {
    render(<Harness initial={{ vm: { host: 'localhost', port: 6080, path: '', secure: false, hostClientId: 'someone-else', hostName: 'Sam', cast: true } }} />);
    expect(screen.getByTestId('vm-watch').textContent).toMatch(/Sam is using this VM/);
    act(() => emitBoardEvent({ type: 'dock.cast', windowId: 'vm-1', frame: 'data:image/jpeg;base64,AAAA', width: 40, height: 30 }));
    expect(screen.getByAltText(/shared by Sam/)).toBeTruthy();
    expect(screen.getByTestId('vm-watch').textContent).toMatch(/View only/);
    // Pictures for another window are ignored.
    act(() => emitBoardEvent({ type: 'dock.cast', windowId: 'other', frame: null }));
    expect(screen.getByAltText(/shared by Sam/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect from here' })).toBeTruthy();
  });
});
