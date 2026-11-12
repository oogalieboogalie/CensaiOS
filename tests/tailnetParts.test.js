// tests/tailnetParts.test.js
//
// The small parts under "My Tailscale devices": telling a Tailscale address
// from any other, reading what Tailscale reports, the owner's tick list on
// disk, finding other copies of censaiOS, and when the extra port opens.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isTailnetAddress, plainAddress, hostNameOf, addressForUrl } from '../server/tailnet/addresses.js';
import { parseTailnetStatus } from '../server/tailnet/parse.js';
import { readTailnetSettings, resetTailnetSettingsCache, writeTailnetSettings } from '../server/tailnet/settings.js';
import { containerReason, insideDockerDesktop, setTailnetReader, tailnetStatus } from '../server/tailnet/status.js';
import { nearbyCopies, setNearbyAsker } from '../server/tailnet/nearby.js';
import { startTailnetListener, stopTailnetListener, syncTailnetListener, tailnetPortNumber } from '../server/tailnet/listener.js';
import { notSwitchedOnPage } from '../server/tailnet/closedPage.js';

const TAILNET = {
  BackendState: 'Running',
  Self: { ID: 'nSELF', HostName: 'officepc', DNSName: 'officepc.tail1234.ts.net.', OS: 'windows', UserID: 1, TailscaleIPs: ['100.101.1.1', 'fd7a:115c:a1e0::1'] },
  Peer: {
    a: { ID: 'nPHONE', HostName: 'localhost', DNSName: 'almas-phone.tail1234.ts.net.', OS: 'iOS', UserID: 1, TailscaleIPs: ['100.101.1.2'], Online: true },
    b: { ID: 'nBOX', HostName: 'homebox', DNSName: 'homebox.tail1234.ts.net.', OS: 'linux', UserID: 9, Tags: ['tag:server'], TailscaleIPs: ['100.101.1.5'], Online: true },
    c: { ID: 'nSAM', HostName: 'sams-mac\u0007<b>', OS: 'macOS', UserID: 2, TailscaleIPs: ['100.101.1.4'], Online: false },
    d: { ID: 'nSHARED', HostName: 'guest-pc', OS: 'windows', UserID: 1, ShareeNode: true, TailscaleIPs: ['100.101.1.6'], Online: true },
    e: { ID: 'nGONE', HostName: 'no-address', OS: 'linux', UserID: 1, TailscaleIPs: [], Online: false },
    f: { ID: 'nODD', HostName: 'wrong-range', OS: 'linux', UserID: 1, TailscaleIPs: ['192.168.1.9'], Online: true },
  },
  User: { 1: { LoginName: 'alma@example.com' }, 2: { LoginName: 'sam@example.com' } },
};

describe('telling a Tailscale address from any other', () => {
  test('only 100.64.0.0 to 100.127.255.255 and Tailscale\'s own IPv6 range count', () => {
    for (const yes of ['100.64.0.1', '100.127.255.254', '100.101.1.2', '::ffff:100.101.1.2', 'fd7a:115c:a1e0::1', '[fd7a:115c:a1e0::1]']) {
      expect(isTailnetAddress(yes)).toBe(true);
    }
    for (const no of ['100.63.255.255', '100.128.0.1', '192.168.1.40', '127.0.0.1', '::1', '10.0.0.1', 'fd7b::1', '100.101.1', '100.101.1.2.3', '', undefined, '100.101.1.2x']) {
      expect(isTailnetAddress(no)).toBe(false);
    }
  });

  test('addresses and names are read the same way however they are written', () => {
    expect(plainAddress('::ffff:100.101.1.2')).toBe('100.101.1.2');
    expect(plainAddress('[FD7A:115C:A1E0::1%tailscale0]')).toBe('fd7a:115c:a1e0::1');
    expect(hostNameOf('OfficePC.Tail1234.ts.net.:3004')).toBe('officepc.tail1234.ts.net');
    expect(hostNameOf('[fd7a:115c:a1e0::1]:3004')).toBe('fd7a:115c:a1e0::1');
    expect(addressForUrl('fd7a:115c:a1e0::1')).toBe('[fd7a:115c:a1e0::1]');
    expect(addressForUrl('100.101.1.1')).toBe('100.101.1.1');
  });
});

describe('reading what Tailscale reports', () => {
  const status = parseTailnetStatus(TAILNET);
  const named = (name) => status.devices.find((device) => device.name === name);

  test('lists the other devices that have a Tailscale address, online ones first', () => {
    expect(status.connected).toBe(true);
    expect(status.self).toMatchObject({ name: 'officepc', dnsName: 'officepc.tail1234.ts.net', addresses: ['100.101.1.1', 'fd7a:115c:a1e0::1'] });
    expect(status.devices.map((device) => device.id)).toEqual(['nPHONE', 'nSHARED', 'nBOX', 'nSAM']);
  });

  test('a phone that calls itself "localhost" gets its tailnet name, and is a phone', () => {
    expect(named('almas-phone')).toMatchObject({ kind: 'phone', mine: true, online: true });
  });

  test('says which devices are the owner\'s own', () => {
    expect(named('homebox')).toMatchObject({ mine: false, tagged: true, owner: '' });
    expect(named('guest-pc').mine).toBe(false);
    const sam = status.devices.find((device) => device.id === 'nSAM');
    expect(sam).toMatchObject({ mine: false, owner: 'sam@example.com', name: 'sams-mac <b>' });
  });

  test('signed out, or nothing readable, means not connected', () => {
    expect(parseTailnetStatus({ ...TAILNET, BackendState: 'NeedsLogin' }).connected).toBe(false);
    expect(parseTailnetStatus({ ...TAILNET, Self: { ...TAILNET.Self, TailscaleIPs: [] } }).connected).toBe(false);
    for (const nothing of [null, undefined, {}, 'text', { Peer: {} }]) {
      expect(parseTailnetStatus(nothing)).toEqual({ connected: false, self: null, devices: [] });
    }
  });

  test('a device name can\'t put markup on the refusal page', () => {
    const page = notSwitchedOnPage('<img src=x onerror=alert(1)>');
    expect(page).not.toContain('<img src=x');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt; is not switched on yet');
  });
});

describe('censaiOS inside Docker', () => {
  test('tells Docker Desktop, where devices can\'t be told apart, from Docker on Linux', () => {
    for (const kernel of ['6.10.14-linuxkit', '5.15.153.1-microsoft-standard-WSL2']) {
      expect(insideDockerDesktop(kernel)).toBe(true);
      expect(containerReason(null, kernel)).toBe('docker-desktop');
    }
    for (const kernel of ['6.8.0-45-generic', '6.1.0-26-amd64']) {
      expect(insideDockerDesktop(kernel)).toBe(false);
      expect(containerReason(null, kernel)).toBe('needs-feed');
      expect(containerReason({ reason: 'stale-feed' }, kernel)).toBe('stale-feed');
    }
  });
});

describe('the owner\'s tick list on disk', () => {
  let dir;
  const env = () => ({ HOMEBASE_STATE_DIR: dir });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailnet-settings-')); resetTailnetSettingsCache(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); resetTailnetSettingsCache(); });

  test('starts off with nothing switched on', () => {
    expect(readTailnetSettings({ env: env() })).toEqual({ on: false, ownerId: null, devices: {} });
  });

  test('remembers the switch, who turned it on and each device, and forgets a device switched off', () => {
    writeTailnetSettings({ on: true, ownerId: 7, allow: [{ id: 'nPHONE', name: 'almas-phone' }, { id: 'nBOX', name: 'homebox' }] }, { env: env() });
    writeTailnetSettings({ refuse: ['nBOX'] }, { env: env() });
    resetTailnetSettingsCache();
    const saved = readTailnetSettings({ env: env() });
    expect(saved).toMatchObject({ on: true, ownerId: 7 });
    expect(Object.keys(saved.devices)).toEqual(['nPHONE']);
  });

  test('a damaged or hand-edited file switches nothing on', () => {
    fs.writeFileSync(path.join(dir, 'tailnet.json'), '{"on":"yes","devices":{"../../x":{},"nOK":{"name":"ok"}}}');
    expect(readTailnetSettings({ env: env(), fresh: true })).toEqual({ on: false, ownerId: null, devices: { nOK: { name: 'ok', addedAt: '' } } });
    fs.writeFileSync(path.join(dir, 'tailnet.json'), 'not json');
    expect(readTailnetSettings({ env: env(), fresh: true })).toEqual({ on: false, ownerId: null, devices: {} });
  });
});

describe('finding other copies of censaiOS on the tailnet', () => {
  afterEach(() => { setNearbyAsker(null); setTailnetReader(null); });

  test('asks only computers that are online, and tells a ready copy from one that has not switched this computer on', async () => {
    setTailnetReader(async () => ({ raw: TAILNET, source: 'program' }));
    await tailnetStatus({ maxAgeMs: 0 });
    const asked = [];
    setNearbyAsker(async (address, port) => {
      asked.push(`${address}:${port}`);
      if (address === '100.101.1.5') return { app: 'censaiOS', name: 'Home box\u0000', admitted: true };
      if (address === '100.101.1.6') return { error: 'closed', doorClosed: true, app: 'censaiOS', tailnet: 'not-switched-on' };
      return { something: 'else' };
    });
    const copies = await nearbyCopies({ fresh: true });
    // The phone and the offline Mac are never asked.
    expect(asked.sort()).toEqual(['100.101.1.5:3004', '100.101.1.6:3004']);
    expect(copies).toEqual([
      { id: 'nSHARED', name: 'guest-pc', device: 'guest-pc', address: `http://${'100.101.1.6'}:3004`, ready: false },
      { id: 'nBOX', name: 'Home box', device: 'homebox', address: `http://${'100.101.1.5'}:3004`, ready: true },
    ]);
  });

  test('finds nothing while Tailscale is signed out', async () => {
    setTailnetReader(async () => ({ raw: { ...TAILNET, BackendState: 'Stopped' }, source: 'program' }));
    setNearbyAsker(async () => { throw new Error('should not ask'); });
    expect(await nearbyCopies({ fresh: true })).toEqual([]);
  });
});

describe('the extra port for Tailscale devices', () => {
  afterEach(() => { stopTailnetListener(); setTailnetReader(null); });

  test('uses the same port number as Open anywhere', () => {
    expect(tailnetPortNumber({})).toBe(3004);
    expect(tailnetPortNumber({ CENSAI_DOOR_PORT: '3014' })).toBe(3014);
    expect(tailnetPortNumber({ CENSAI_DOOR_PORT: 'off' })).toBe(3004);
  });

  test('stays shut while the switch is off, and is not opened beside an Open anywhere port', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailnet-port-'));
    const before = process.env.HOMEBASE_STATE_DIR;
    process.env.HOMEBASE_STATE_DIR = dir;
    resetTailnetSettingsCache();
    try {
      setTailnetReader(async () => ({ raw: TAILNET, source: 'program' }));
      startTailnetListener({ emit() {} }, () => {}, { doorPort: null });
      expect(await syncTailnetListener()).toEqual({ ownPort: false, port: null, problem: '' });
      stopTailnetListener();
      writeTailnetSettings({ on: true, ownerId: 7 });
      startTailnetListener({ emit() {} }, () => {}, { doorPort: 3004 });
      expect(await syncTailnetListener()).toEqual({ ownPort: false, port: 3004, problem: '' });
    } finally {
      if (before === undefined) delete process.env.HOMEBASE_STATE_DIR; else process.env.HOMEBASE_STATE_DIR = before;
      resetTailnetSettingsCache();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
