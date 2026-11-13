// Passwordless email sign-in (POST /api/auth/developer) may run only when the
// socket itself is this machine. Flex runs private_server inside the image
// (CENSAI_IN_CONTAINER=1) and publishes 0.0.0.0. With the flag on, a Wi-Fi
// client used to pass by sending Host: localhost, because the socket check
// ran only for local_desktop outside a container.

import {
  isDeveloperLoginAllowed,
  isDeveloperSignInOnThisComputer,
} from '../server/security/authPolicy.js';

const FLEX_ENV = {
  HOMEBASE_MODE: 'private_server',
  CENSAI_IN_CONTAINER: '1',
  CENSAI_ALLOW_DEVELOPER_LOGIN: 'true',
  APP_ORIGIN: 'http://flex:3002',
};

const ENV_KEYS = [
  'CENSAI_MODE',
  'HOMEBASE_MODE',
  'CENSAI_IN_CONTAINER',
  'CENSAI_ALLOW_DEVELOPER_LOGIN',
  'APP_ORIGIN',
];

function requestFrom(remoteAddress, headers = {}) {
  const lower = {};
  for (const [name, value] of Object.entries(headers)) lower[name.toLowerCase()] = value;
  return {
    socket: remoteAddress === undefined ? undefined : { remoteAddress },
    ip: headers['x-forwarded-for'],
    headers: lower,
    get(name) {
      return lower[String(name).toLowerCase()];
    },
  };
}

function signIn(remoteAddress, headers, env = process.env) {
  return isDeveloperSignInOnThisComputer(requestFrom(remoteAddress, headers), { env });
}

describe('developer sign-in follows the socket, never a header', () => {
  const previous = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) previous[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, FLEX_ENV);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  test('flex with the flag on still only means the mode allows the feature', () => {
    expect(isDeveloperLoginAllowed({
      env: process.env,
      runtimeMode: 'private_server',
    })).toBe(true);
  });

  test('a spoofed localhost Host from a LAN address is refused', () => {
    expect(signIn('192.168.1.40', {
      host: 'localhost:3002',
      'x-forwarded-host': 'localhost',
    })).toBe(false);
    expect(signIn('192.168.1.40', { host: '127.0.0.1:3002' })).toBe(false);
    expect(signIn('192.168.1.40', { host: '[::1]:3002' })).toBe(false);
    expect(signIn('192.168.1.40', { host: 'flex:3002' })).toBe(false);
  });

  test('a spoofed X-Forwarded-For of 127.0.0.1 from a LAN address is refused', () => {
    expect(signIn('10.4.5.6', {
      host: 'localhost:3002',
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-host': 'localhost:3002',
      forwarded: 'for=127.0.0.1;host=localhost:3002',
    })).toBe(false);
  });

  test('a LAN IPv4 address and a LAN IPv6 address are refused', () => {
    expect(signIn('192.168.0.24', { host: 'localhost' })).toBe(false);
    expect(signIn('::ffff:192.168.0.24', { host: 'localhost' })).toBe(false);
    expect(signIn('fd00::10', { host: '[::1]' })).toBe(false);
    expect(signIn('fe80::1', { host: 'localhost' })).toBe(false);
  });

  test.each([
    '127.0.0.1',
    '127.0.0.8',
    '::1',
    '::ffff:127.0.0.1',
  ])('loopback %s with a forwarding header is refused', (address) => {
    expect(signIn(address, {
      host: 'localhost:3002',
      'x-forwarded-for': '192.168.1.40',
      'x-forwarded-host': '192.168.1.40',
      forwarded: 'for=192.168.1.40',
    })).toBe(false);
  });

  test('a tunnel on loopback with a public host and X-Forwarded-For is refused', () => {
    expect(signIn('127.0.0.1', {
      host: 'box.something.ts.net',
      'x-forwarded-for': '203.0.113.50',
    })).toBe(false);
  });

  test.each([
    ['x-forwarded-for', '203.0.113.50'],
    ['forwarded', 'for=203.0.113.50'],
    ['x-real-ip', '203.0.113.50'],
    ['x-forwarded-host', 'box.something.ts.net'],
    ['x-forwarded-proto', 'https'],
    ['cf-connecting-ip', '203.0.113.50'],
    ['true-client-ip', '203.0.113.50'],
    ['via', '1.1 cloudflared'],
    ['tailscale-user-login', 'visitor@example.com'],
  ])('loopback with %s is refused even when Host is localhost', (header, value) => {
    expect(signIn('127.0.0.1', { host: 'localhost:3002', [header]: value })).toBe(false);
  });

  test('a public Host on loopback is refused, including this copy\'s APP_ORIGIN', () => {
    expect(signIn('127.0.0.1', { host: 'box.something.ts.net' })).toBe(false);
    expect(signIn('127.0.0.1', { host: 'flex:3002' })).toBe(false);
    process.env.APP_ORIGIN = 'https://homebase.example.com';
    expect(signIn('127.0.0.1', { host: 'homebase.example.com' })).toBe(false);
  });

  test('a missing or empty Host is refused on loopback', () => {
    expect(signIn('127.0.0.1', {})).toBe(false);
    expect(signIn('127.0.0.1', { host: '' })).toBe(false);
  });

  test('an empty proxy header is still a proxy', () => {
    expect(signIn('127.0.0.1', { host: 'localhost:3002', 'x-forwarded-for': '' })).toBe(false);
  });

  test.each([
    '127.0.0.1',
    '127.0.0.8',
    '::1',
    '::ffff:127.0.0.1',
  ])('plain loopback %s with a localhost Host is allowed', (address) => {
    const host = address === '::1' ? '[::1]:3002' : 'localhost:3002';
    expect(signIn(address, { host })).toBe(true);
  });

  test('an address that is not a real loopback IP is refused', () => {
    expect(signIn('127.999.1.1', { host: 'localhost:3002' })).toBe(false);
    expect(signIn('127.0.0.01', { host: 'localhost:3002' })).toBe(false);
  });

  test('a missing socket is refused', () => {
    expect(signIn(undefined, { host: 'localhost' })).toBe(false);
  });

  test('local desktop, in a container or not, uses the same socket rule', () => {
    const modes = [
      { CENSAI_MODE: 'local_desktop', CENSAI_ALLOW_DEVELOPER_LOGIN: 'true', APP_ORIGIN: 'http://localhost:3002' },
      {
        CENSAI_MODE: 'local_desktop',
        CENSAI_IN_CONTAINER: '1',
        CENSAI_ALLOW_DEVELOPER_LOGIN: 'true',
        APP_ORIGIN: 'http://localhost:3002',
      },
    ];
    for (const env of modes) {
      for (const key of ENV_KEYS) delete process.env[key];
      Object.assign(process.env, env);
      expect(signIn('172.18.0.1', { host: 'localhost:3002' }, process.env)).toBe(false);
      expect(signIn('192.168.1.20', { host: 'localhost:3002' }, process.env)).toBe(false);
      expect(signIn('::ffff:127.0.0.1', { host: 'localhost:3002' }, process.env)).toBe(true);
    }
  });
});
