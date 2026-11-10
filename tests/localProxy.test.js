import { describe, expect, test } from '@jest/globals';
import { isLocalSignInAllowed } from '../server/security/authPolicy.js';
import { isFromAnotherComputer } from '../server/webOs/door.js';
import { cameThroughLocalProxy, proxyBrowserOriginAllowed } from '../server/webOs/localProxy.js';

const ENV = { APP_ORIGIN: 'http://localhost:3012' };
const MODE = { env: ENV, runtimeMode: 'local_desktop' };

function req({ host = 'localhost:3012', remote = '127.0.0.1', headers = {} } = {}) {
  return {
    socket: { remoteAddress: remote },
    headers,
    get(name) {
      const key = String(name || '').toLowerCase();
      if (key === 'host') return host;
      const found = Object.keys(headers).find((item) => item.toLowerCase() === key);
      return found ? headers[found] : '';
    },
  };
}

describe('a local reverse proxy in front of 127.0.0.1', () => {
  test('the owner on localhost still gets one-click sign-in', () => {
    const owner = req();
    expect(cameThroughLocalProxy(owner)).toBe(false);
    expect(isFromAnotherComputer(owner, MODE)).toBe(false);
    expect(isLocalSignInAllowed(owner, MODE)).toBe(true);
  });

  test('Tailscale Serve is another computer, even though it connects from 127.0.0.1', () => {
    const served = req({
      host: '127.0.0.1:3012',
      headers: {
        'Tailscale-User-Login': 'owner@example.com',
        'X-Forwarded-For': '100.64.1.8',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'officepc.tailnet.ts.net',
      },
    });
    expect(cameThroughLocalProxy(served)).toBe(true);
    expect(isFromAnotherComputer(served, MODE)).toBe(true);
    expect(isLocalSignInAllowed(served, MODE)).toBe(false);
    expect(proxyBrowserOriginAllowed(served, 'https://officepc.tailnet.ts.net')).toBe(true);
    expect(proxyBrowserOriginAllowed(served, 'https://evil.example')).toBe(false);
  });

  test('Tailscale Funnel is another computer even with no tailnet identity', () => {
    const funnel = req({
      host: '127.0.0.1:3012',
      headers: {
        'X-Forwarded-For': '203.0.113.50',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'officepc.tailnet.ts.net',
      },
    });
    expect(funnel.headers['Tailscale-User-Login']).toBeUndefined();
    expect(cameThroughLocalProxy(funnel)).toBe(true);
    expect(isFromAnotherComputer(funnel, MODE)).toBe(true);
    expect(isLocalSignInAllowed(funnel, MODE)).toBe(false);
    expect(proxyBrowserOriginAllowed(funnel, 'https://officepc.tailnet.ts.net')).toBe(true);
    expect(proxyBrowserOriginAllowed(funnel, 'https://evil.example')).toBe(false);

    const protoOnly = req({
      host: 'localhost:3012',
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    expect(cameThroughLocalProxy(protoOnly)).toBe(true);
    expect(isLocalSignInAllowed(protoOnly, MODE)).toBe(false);
  });

  test('a proxy that keeps the public host is the same kind of visitor', () => {
    const proxied = req({ host: 'officepc.tailnet.ts.net' });
    expect(cameThroughLocalProxy(proxied)).toBe(true);
    expect(isLocalSignInAllowed(proxied, MODE)).toBe(false);
    expect(proxyBrowserOriginAllowed(proxied, 'https://officepc.tailnet.ts.net/')).toBe(true);
    expect(proxyBrowserOriginAllowed(proxied, 'https://evil.example')).toBe(false);
  });

  test('a machine that is not this computer cannot turn one-click on by sending proxy headers', () => {
    const outsider = req({
      remote: '100.64.1.8',
      host: 'localhost:3012',
      headers: { 'X-Forwarded-For': '' },
    });
    expect(cameThroughLocalProxy(outsider)).toBe(false);
    expect(isLocalSignInAllowed(outsider, MODE)).toBe(false);
    expect(isFromAnotherComputer(outsider, MODE)).toBe(true);
  });
});
