import { jest } from '@jest/globals';

// Adding a window at a plain-http address (backlog 38): the browser hides
// crypto.randomUUID there, so the board's one ID maker falls back to
// crypto.getRandomValues and logs it once.

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logToApp }));
const { newId, fallbackUuid, installRandomUuid } = await import('../src/lib/ids/newId.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const realCrypto = globalThis.crypto;

function withCrypto(value, fn) {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  try { return fn(); } finally { Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true }); }
}

test('uses crypto.randomUUID where the browser offers it', () => {
  withCrypto({ randomUUID: () => 'from-browser', getRandomValues: (b) => b }, () => {
    expect(newId()).toBe('from-browser');
  });
  expect(logToApp).not.toHaveBeenCalled();
});

test('falls back on plain http, gives distinct v4 ids, and logs once', () => {
  const plainHttp = { getRandomValues: (b) => realCrypto.getRandomValues(b) };
  withCrypto(plainHttp, () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID);
  });
  expect(logToApp).toHaveBeenCalledTimes(1);
  expect(logToApp.mock.calls[0][1]).toMatch(/fallback ID maker/);
});

test('fallbackUuid works with no crypto at all', () => {
  expect(fallbackUuid(undefined)).toMatch(UUID);
});

test('installRandomUuid fills the gap for other code and leaves a real one alone', () => {
  const plainHttp = { getRandomValues: (b) => realCrypto.getRandomValues(b) };
  expect(installRandomUuid(plainHttp)).toBe(true);
  expect(plainHttp.randomUUID()).toMatch(UUID);
  const real = { randomUUID: () => 'x' };
  expect(installRandomUuid(real)).toBe(false);
  expect(real.randomUUID()).toBe('x');
});
