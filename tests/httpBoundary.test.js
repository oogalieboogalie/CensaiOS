import {
  getProxyTrustSetting,
  isAllowedBrowserOrigin,
  lanOrigins,
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

  test('local desktop accepts the home-network origins the owner listed', () => {
    const extraOrigins = lanOrigins({ CENSAI_LAN_ORIGINS: ' http://officepc:3002/ , http://192.168.0.17:3002' });
    expect(extraOrigins).toEqual(['http://officepc:3002', 'http://192.168.0.17:3002']);
    const options = { appOrigin: 'http://localhost:3002', runtimeMode: 'local_desktop', extraOrigins };
    expect(isAllowedBrowserOrigin('http://officepc:3002', options)).toBe(true);
    expect(isAllowedBrowserOrigin('http://192.168.0.17:3002', options)).toBe(true);
    expect(isAllowedBrowserOrigin('http://officepc:4000', options)).toBe(false);
    expect(isAllowedBrowserOrigin('http://other-pc:3002', options)).toBe(false);
    expect(isAllowedBrowserOrigin('http://officepc:3002', { ...options, extraOrigins: lanOrigins({}) })).toBe(false);
  });

  test('home-network origins never open cloud or private servers', () => {
    const extraOrigins = ['http://officepc:3002'];
    for (const runtimeMode of ['cloud_saas', 'private_server']) {
      expect(isAllowedBrowserOrigin('http://officepc:3002', { appOrigin: 'https://beta.censai.app', runtimeMode, extraOrigins })).toBe(false);
    }
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
