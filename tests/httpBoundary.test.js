import {
  getProxyTrustSetting,
  isAllowedBrowserOrigin,
} from '../server/security/httpBoundary.js';

describe('HTTP deployment boundary', () => {
  test('cloud and private modes accept only the configured browser origin', () => {
    for (const runtimeMode of ['cloud_saas', 'private_server']) {
      const options = { appOrigin: 'https://beta.censai.app', runtimeMode };
      expect(isAllowedBrowserOrigin('https://beta.censai.app', options)).toBe(true);
      expect(isAllowedBrowserOrigin('http://localhost:5173', options)).toBe(false);
      expect(isAllowedBrowserOrigin('https://attacker.example', options)).toBe(false);
      expect(isAllowedBrowserOrigin('tauri://localhost', options)).toBe(false);
    }
  });

  test('local desktop keeps loopback and Tauri development origins', () => {
    const options = { appOrigin: 'http://localhost:5173', runtimeMode: 'local_desktop' };
    expect(isAllowedBrowserOrigin('http://127.0.0.1:3002', options)).toBe(true);
    expect(isAllowedBrowserOrigin('tauri://localhost', options)).toBe(true);
    expect(isAllowedBrowserOrigin('https://attacker.example', options)).toBe(false);
  });

  test('non-browser requests remain available to native clients and probes', () => {
    expect(isAllowedBrowserOrigin(undefined, {
      appOrigin: 'https://beta.censai.app',
      runtimeMode: 'cloud_saas',
    })).toBe(true);
  });

  test('proxy trust is off by default and validates explicit hop counts', () => {
    expect(getProxyTrustSetting({})).toBe(false);
    expect(getProxyTrustSetting({ CENSAI_TRUST_PROXY_HOPS: '0' })).toBe(false);
    expect(getProxyTrustSetting({ CENSAI_TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(() => getProxyTrustSetting({ CENSAI_TRUST_PROXY_HOPS: 'all' }))
      .toThrow('integer from 0 to 10');
    expect(() => getProxyTrustSetting({ CENSAI_TRUST_PROXY_HOPS: '11' }))
      .toThrow('integer from 0 to 10');
  });
});
