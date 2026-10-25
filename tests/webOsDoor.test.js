// tests/webOsDoor.test.js
//
// Open anywhere (web OS): with the owner's switch on, another computer on the
// home network opens this censaiOS by its address. Public names never pass
// (DNS rebinding), the switch is off by default, only local_desktop copies
// open, and a request must ask the same address the page came from.

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cameThroughDoor,
  candidateHosts,
  doorAllowsOrigin,
  isFromAnotherComputer,
  isHomeNetworkHostname,
  markThroughDoor,
  readDoorSettings,
  resetDoorCache,
  writeDoorSettings,
} from '../server/webOs/door.js';

const OPEN = { settings: { open: true, address: '' }, runtimeMode: 'local_desktop' };

function fakeReq(host) {
  return { get: (name) => (name.toLowerCase() === 'host' ? host : undefined) };
}

describe('home network names', () => {
  test.each([
    'officepc', 'officepc:3002', 'laptop.local', 'nas.lan', 'pc.home.arpa', '192.168.1.23', '10.0.0.5:3002',
    '172.20.1.1', '100.101.102.103', '[fd12:3456::1]',
  ])('%s is a home network address', (host) => {
    expect(isHomeNetworkHostname(host)).toBe(true);
  });

  test.each([
    'localhost', '127.0.0.1', 'evil.com', 'officepc.attacker.example', '8.8.8.8', '172.32.0.1', '', 'bad_name!',
  ])('%s is not', (host) => {
    expect(isHomeNetworkHostname(host)).toBe(false);
  });
});

describe('the Open anywhere door', () => {
  test('lets a home-network computer in when it asks its own address', () => {
    expect(doorAllowsOrigin('http://officepc:3002', 'officepc:3002', OPEN)).toBe(true);
    expect(doorAllowsOrigin('http://192.168.1.23:3002', '192.168.1.23:3002', OPEN)).toBe(true);
  });

  test('stays shut when the switch is off (the default)', () => {
    expect(doorAllowsOrigin('http://officepc:3002', 'officepc:3002', { ...OPEN, settings: { open: false } })).toBe(false);
  });

  test('never opens cloud or private servers', () => {
    for (const runtimeMode of ['cloud_saas', 'private_server']) {
      expect(doorAllowsOrigin('http://officepc:3002', 'officepc:3002', { ...OPEN, runtimeMode })).toBe(false);
    }
  });

  test('refuses public names, even when Host matches (DNS rebinding)', () => {
    expect(doorAllowsOrigin('http://evil.com:3002', 'evil.com:3002', OPEN)).toBe(false);
  });

  test('refuses a page on one address asking another', () => {
    expect(doorAllowsOrigin('http://officepc:3002', '192.168.1.23:3002', OPEN)).toBe(false);
    expect(doorAllowsOrigin('http://officepc:4000', 'officepc:3002', OPEN)).toBe(false);
    expect(doorAllowsOrigin('null', 'officepc:3002', OPEN)).toBe(false);
    expect(doorAllowsOrigin(undefined, 'officepc:3002', OPEN)).toBe(false);
  });
});

describe('another computer', () => {
  const env = { APP_ORIGIN: 'http://localhost:3002', CENSAI_LAN_ORIGINS: 'http://laptop:3002' };
  const fromSocket = (remoteAddress, host = 'localhost:3002') => ({ ...fakeReq(host), socket: { remoteAddress } });

  test('is anything that came in through the Open anywhere port, whatever it claims', () => {
    const req = { ...fakeReq('localhost:3002'), socket: markThroughDoor({ remoteAddress: '127.0.0.1' }) };
    expect(cameThroughDoor(req)).toBe(true);
    expect(isFromAnotherComputer(req, { env })).toBe(true);
    expect(cameThroughDoor(fromSocket('127.0.0.1'))).toBe(false);
  });

  test('is any other machine reaching a server started outside Docker, even with a faked Host', () => {
    for (const address of ['192.168.1.40', '::ffff:192.0.2.2', '8.8.8.8']) {
      expect(isFromAnotherComputer(fromSocket(address), { env, runtimeMode: 'local_desktop' })).toBe(true);
    }
    expect(isFromAnotherComputer(fromSocket('127.0.0.1'), { env, runtimeMode: 'local_desktop' })).toBe(false);
    expect(isFromAnotherComputer(fromSocket('::1'), { env, runtimeMode: 'local_desktop' })).toBe(false);
  });

  test('inside Docker the published port decides, so the gateway address is not held against it', () => {
    const docker = { ...env, CENSAI_IN_CONTAINER: '1' };
    expect(isFromAnotherComputer(fromSocket('172.18.0.1'), { env: docker, runtimeMode: 'local_desktop' })).toBe(false);
  });

  test('is a request that reached a home-network address', () => {
    expect(isFromAnotherComputer(fakeReq('officepc:3002'), { env })).toBe(true);
    expect(isFromAnotherComputer(fakeReq('192.168.1.23:3002'), { env })).toBe(true);
  });

  test('a listed LAN origin no longer skips the code', () => {
    expect(isFromAnotherComputer(fakeReq('laptop:3002'), { env })).toBe(true);
  });

  test('is not this computer or APP_ORIGIN', () => {
    expect(isFromAnotherComputer(fakeReq('localhost:3002'), { env })).toBe(false);
    expect(isFromAnotherComputer(fakeReq('officepc:3002'), { env: { APP_ORIGIN: 'http://officepc:3002' } })).toBe(false);
  });
});

describe('door settings', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-os-'));
    resetDoorCache();
  });
  afterEach(() => {
    resetDoorCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('are off by default and saved to the state folder', () => {
    const env = { HOMEBASE_STATE_DIR: dir };
    expect(readDoorSettings({ env, fresh: true })).toEqual({ open: false, address: '' });
    writeDoorSettings({ open: true, address: 'http://OFFICEPC:3002/' }, { env });
    resetDoorCache();
    expect(readDoorSettings({ env })).toEqual({ open: true, address: 'officepc' });
  });

  test('the typed computer name comes first among the addresses', () => {
    const hosts = candidateHosts({ env: { CENSAI_HOST_NAME: 'OFFICEPC' }, settings: { open: true, address: 'pc.local' } });
    expect(hosts.slice(0, 2)).toEqual(['pc.local', 'officepc']);
    expect(hosts).not.toContain('localhost');
  });
});
