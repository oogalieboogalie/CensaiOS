import express from 'express';
import request from 'supertest';
import { createCsrfOriginGuard } from '../server/middleware/security.js';
import { isAllowedBrowserOrigin } from '../server/security/httpBoundary.js';
import { upgradeOriginAllowed } from '../server/ws/upgradeOrigin.js';

const CONFIGURED = 'http://localhost:3002';

const ALLOWED_TWINS = [
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://[::1]:3002',
];

const REJECTED = [
  ['other port', 'http://127.0.0.1:3003'],
  ['other port on the configured name', 'http://localhost:5173'],
  ['LAN address', 'http://192.168.1.20:3002'],
  ['localhost suffix', 'http://localhost.evil.com:3002'],
  ['dotted-quad suffix', 'http://127.0.0.1.evil.com:3002'],
  ['trailing dot', 'http://localhost.:3002'],
  ['userinfo', 'http://evil.com@127.0.0.1:3002'],
  ['userinfo on the configured host', 'http://user@localhost:3002'],
  ['userinfo with a password', 'http://user:pass@localhost:3002'],
  ['decimal loopback', 'http://2130706433:3002'],
  ['backslash scheme', 'http:\\\\localhost:3002'],
  ['one backslash scheme', 'http:\\localhost:3002'],
  ['single slash scheme', 'http:/localhost:3002'],
  ['backslash before at-sign', 'http://localhost:3002\\@evil.com'],
  ['host with a backslash at-sign', 'localhost:3002\\@evil.com'],
  ['hex loopback', 'http://0x7f.1:3002'],
  ['short loopback', 'http://127.1:3002'],
  ['ipv4-mapped loopback', 'http://[::ffff:127.0.0.1]:3002'],
  ['comma-joined origin', 'http://localhost:3002, http://evil.example'],
  ['other scheme', 'https://127.0.0.1:3002'],
  ['other scheme on the configured name', 'https://localhost:3002'],
  ['null origin', 'null'],
];

function withEnv(extra, run) {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    API_ORIGIN: process.env.API_ORIGIN,
    CENSAI_MODE: process.env.CENSAI_MODE,
    HOMEBASE_MODE: process.env.HOMEBASE_MODE,
  };
  Object.assign(process.env, extra);
  const finish = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = run();
    if (result && typeof result.then === 'function') return result.finally(finish);
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

function csrfApp({ appOrigin = CONFIGURED, apiOrigin } = {}) {
  const app = express();
  app.use(createCsrfOriginGuard({ appOrigin, apiOrigin }));
  app.post('/save', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('loopback names with the same scheme and port', () => {
  test.each(['local_desktop', 'private_server', 'cloud_saas'])(
    'counts localhost, 127.0.0.1 and [::1] as one origin in %s',
    (runtimeMode) => {
      const options = { appOrigin: CONFIGURED, runtimeMode, extraOrigins: [] };
      for (const origin of ALLOWED_TWINS) {
        expect(isAllowedBrowserOrigin(origin, options)).toBe(true);
      }
    },
  );

  test.each(REJECTED)('rejects %s', (_label, origin) => {
    for (const runtimeMode of ['local_desktop', 'private_server', 'cloud_saas']) {
      expect(isAllowedBrowserOrigin(origin, {
        appOrigin: CONFIGURED,
        runtimeMode,
        extraOrigins: [],
      })).toBe(false);
    }
  });

  test('does not treat a loopback address as some other configured host', () => {
    expect(isAllowedBrowserOrigin('http://127.0.0.1:3002', {
      appOrigin: 'http://flex:3002',
      runtimeMode: 'private_server',
      extraOrigins: [],
    })).toBe(false);
    expect(isAllowedBrowserOrigin('https://127.0.0.1', {
      appOrigin: 'https://beta.censai.app',
      runtimeMode: 'cloud_saas',
      extraOrigins: [],
    })).toBe(false);
    expect(isAllowedBrowserOrigin('http://127.0.0.1:3002', {
      appOrigin: 'http://localhost:5173',
      runtimeMode: 'local_desktop',
      extraOrigins: [],
    })).toBe(false);
    expect(isAllowedBrowserOrigin('http://2130706433:3002', {
      appOrigin: 'http://127.0.0.1:3002',
      runtimeMode: 'private_server',
      extraOrigins: [],
    })).toBe(false);
  });
});

describe('strict CSRF accepts only those loopback twins', () => {
  async function post(origin, host, options) {
    const response = await request(csrfApp(options))
      .post('/save')
      .set('Host', host)
      .set('Origin', origin);
    return response.status;
  }

  test.each(ALLOWED_TWINS)('allows %s when the server origin is localhost:3002', async (origin) => {
    const host = new URL(origin).host;
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, async () => {
      await expect(post(origin, host)).resolves.toBe(200);
    });
  });

  test.each(REJECTED)('rejects %s', async (_label, origin) => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, async () => {
      await expect(post(origin, 'localhost:3002')).resolves.toBe(403);
    });
  });

  test('allows a loopback twin of API_ORIGIN without opening the public app origin', async () => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'cloud_saas', APP_ORIGIN: 'https://beta.censai.app' }, async () => {
      await expect(post('http://127.0.0.1:3001', '127.0.0.1:3001', {
        appOrigin: 'https://beta.censai.app',
        apiOrigin: 'http://localhost:3001',
      })).resolves.toBe(200);
      await expect(post('http://127.0.0.1:3002', 'localhost:3001', {
        appOrigin: 'https://beta.censai.app',
        apiOrigin: 'http://localhost:3001',
      })).resolves.toBe(403);
    });
  });

  test('does not treat a rewritten loopback spelling as the configured address', async () => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: 'http://127.0.0.1:3002' }, async () => {
      await expect(post('http://2130706433:3002', '127.0.0.1:3002', {
        appOrigin: 'http://127.0.0.1:3002',
      })).resolves.toBe(403);
      await expect(post('http://user@127.0.0.1:3002', '127.0.0.1:3002', {
        appOrigin: 'http://127.0.0.1:3002',
      })).resolves.toBe(403);
    });
  });

  test('a same-origin fetch site does not excuse userinfo', async () => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, async () => {
      const response = await request(csrfApp())
        .post('/save')
        .set('Host', 'localhost:3002')
        .set('Origin', 'http://user@localhost:3002')
        .set('Sec-Fetch-Site', 'same-origin');
      expect(response.status).toBe(403);
    });
  });

  test('rejects a duplicate Origin header', async () => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, async () => {
      const response = await request(csrfApp())
        .post('/save')
        .set('Host', 'localhost:3002')
        .set('Origin', ['http://localhost:3002', 'http://evil.example']);
      expect(response.status).toBe(403);
    });
  });

  test('rejects a missing Origin and a LAN host', async () => {
    await withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, async () => {
      const missing = await request(csrfApp()).post('/save').set('Host', 'localhost:3002');
      expect(missing.status).toBe(403);
      const lan = await request(csrfApp())
        .post('/save')
        .set('Host', '192.168.1.20:3002')
        .set('Origin', 'http://192.168.1.20:3002');
      expect(lan.status).toBe(403);
      const otherPort = await request(csrfApp())
        .post('/save')
        .set('Host', '127.0.0.1:3003')
        .set('Origin', 'http://127.0.0.1:3003');
      expect(otherPort.status).toBe(403);
    });
  });
});

describe('WebSocket upgrade accepts only those loopback twins', () => {
  function handshake(origin) {
    const headers = { host: 'localhost:3002' };
    if (origin !== undefined) headers.origin = origin;
    return { headers };
  }

  test.each(ALLOWED_TWINS)('allows %s', (origin) => {
    withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, () => {
      expect(upgradeOriginAllowed(handshake(origin))).toBe(true);
    });
  });

  test.each(REJECTED)('rejects %s', (_label, origin) => {
    withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, () => {
      expect(upgradeOriginAllowed(handshake(origin))).toBe(false);
    });
  });

  test('rejects a duplicate Origin header', () => {
    withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, () => {
      expect(upgradeOriginAllowed({
        headers: {
          host: 'localhost:3002',
          origin: ['http://localhost:3002', 'http://evil.example'],
        },
      })).toBe(false);
    });
  });

  test('refuses a foreign Host the way the HTTP guard does', () => {
    withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, () => {
      expect(upgradeOriginAllowed({
        headers: { host: 'evil.example', origin: CONFIGURED },
      })).toBe(false);
      expect(upgradeOriginAllowed({
        headers: { host: '127.0.0.1:3002', origin: 'http://127.0.0.1:3002' },
      })).toBe(true);
      expect(upgradeOriginAllowed({
        headers: { host: 'localhost:3002', origin: 'http://[::1]:3002' },
      })).toBe(true);
    });
  });

  test('rejects a missing Origin outside Jest', () => {
    withEnv({ NODE_ENV: 'production', CENSAI_MODE: 'private_server', APP_ORIGIN: CONFIGURED }, () => {
      expect(upgradeOriginAllowed(handshake(undefined))).toBe(false);
    });
  });
});
