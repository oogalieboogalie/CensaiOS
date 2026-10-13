import { createRateLimiter, createAuthRateLimiter, createCsrfOriginGuard }
  from './security.js';

const REAL_ENV = { ...process.env };
const setEnv = (o) => Object.assign(process.env, o);

function req({ method = 'POST', host = 'localhost:3000', origin, site, ip = '1.2.3.4', body = {}, extra = {} } = {}) {
  const headers = { host, ...extra };
  if (origin !== undefined) headers.origin = origin;
  if (site !== undefined) headers['sec-fetch-site'] = site;
  return { method, headers, body, ip, socket: { remoteAddress: ip }, get: (n) => headers[n.toLowerCase()] };
}
function res() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
}

beforeEach(() => setEnv({ NODE_ENV: 'development', RATE_LIMIT_DISABLED: '', APP_ORIGIN: 'http://localhost:5173' }));
afterEach(() => setEnv(REAL_ENV));

describe('rate limiter', () => {
  test('allows up to max, then 429 with Retry-After', () => {
    const mw = createAuthRateLimiter();
    for (let i = 0; i < 5; i++) mw(req(), res(), () => {});
    const r = res(); mw(req(), r, () => {});
    expect(r.statusCode).toBe(429);
    expect(r.headers['Retry-After']).toBeDefined();
  });

  test('counts usernames separately behind a shared IP', () => {
    const mw = createAuthRateLimiter();
    for (let i = 0; i < 5; i++) mw(req({ body: { username: 'genesis' } }), res(), () => {});
    const r = res(); mw(req({ body: { username: 'cencai' } }), r, () => {});
    expect(r.statusCode).toBe(200);
  });

  test('RULE 1: RATE_LIMIT_DISABLED=true does nothing in production', () => {
    setEnv({ NODE_ENV: 'production', RATE_LIMIT_DISABLED: 'true' });
    const mw = createAuthRateLimiter();
    for (let i = 0; i < 6; i++) mw(req(), res(), () => {});
    const r = res(); mw(req(), r, () => {});
    expect(r.statusCode).toBe(429);
  });

  test('RULE 2: x-bypass-rate-limit header is inert everywhere', () => {
    const mw = createAuthRateLimiter();
    for (let i = 0; i < 5; i++) mw(req(), res(), () => {});
    const r = res();
    mw(req({ extra: { 'x-bypass-rate-limit': 'true' } }), r, () => {});
    expect(r.statusCode).toBe(429);
  });

  test('bypass works in dev/local_desktop only', () => {
    setEnv({ RATE_LIMIT_DISABLED: 'true' });
    const mw = createAuthRateLimiter();
    for (let i = 0; i < 10; i++) mw(req(), res(), () => {});
    const r = res(); mw(req(), r, () => {});
    expect(r.statusCode).toBe(200);
  });

  test('RULE 3: auth limiter fails closed when key cannot be computed', () => {
    const mw = createAuthRateLimiter({ keyFor: () => null });
    const r = res(); mw(req(), r, () => {});
    expect(r.statusCode).toBe(503);
  });

  test('general limiter fails open instead', () => {
    const mw = createRateLimiter({ keyFor: () => null });
    const r = res(); let passed = false;
    mw(req(), r, () => { passed = true; });
    expect(passed).toBe(true);
  });
});

describe('csrf origin guard', () => {
  const guard = () => createCsrfOriginGuard();

  test('SAFE_METHODS pass untouched', () => {
    let ok = false; guard()(req({ method: 'GET' }), res(), () => { ok = true; });
    expect(ok).toBe(true);
  });

  test('RULE 4: unknown Host is rejected (DNS rebinding dies here)', () => {
    const r = res();
    guard()(req({ host: 'evil.com', origin: 'http://evil.com', site: 'same-origin' }), r, () => {});
    expect(r.statusCode).toBe(403);
  });

  test('configured origin passes', () => {
    let ok = false;
    guard()(req({ origin: 'http://localhost:5173', site: 'same-site' }), res(), () => { ok = true; });
    expect(ok).toBe(true);
  });

  test('missing Origin (native client) passes after host check', () => {
    let ok = false; guard()(req(), res(), () => { ok = true; });
    expect(ok).toBe(true);
  });

  test('foreign origin is rejected', () => {
    const r = res();
    guard()(req({ origin: 'https://attacker.example' }), r, () => {});
    expect(r.statusCode).toBe(403);
  });

  test('localhost origin allowed in dev… ', () => {
    let ok = false;
    guard()(req({ origin: 'http://localhost:9999' }), res(), () => { ok = true; });
    expect(ok).toBe(true);
  });

  test('…but not in production', () => {
    setEnv({ NODE_ENV: 'production', APP_ORIGIN: 'https://family.example' });
    const g = createCsrfOriginGuard();
    const r = res(); g(req({ host: 'family.example', origin: 'http://localhost:9999' }), r, () => {});
    expect(r.statusCode).toBe(403);
  });

  test('boot fails fast on malformed APP_ORIGIN instead of failing open later', () => {
    expect(() => createCsrfOriginGuard({ appOrigin: 'not-a-url' })).toThrow(/absolute URL/);
  });
});