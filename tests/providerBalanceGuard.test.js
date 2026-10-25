import { jest } from '@jest/globals';

// "Ask the provider" goes through the app's outbound checks: the provider's
// fixed host is looked up once, a private address is refused in plain words
// before any call, and the call is pinned to the address that was checked.
// One 'ai-resources' log line per ask, never the key. Made-up keys only.
const logLines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => Object.fromEntries(['info', 'warn', 'error', 'debug'].map((level) => [level, (message, meta) => logLines.push({ name, level, message, meta })])),
}));

const { readProviderBalance } = await import('../server/aiResources/providerBalance.js');

const KEY = 'sk-or-v1-FAKE-pat-0000';
const answers = (address) => jest.fn(async () => [{ address, family: 4 }]);
const credits = () => jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { total_credits: 20, total_usage: 5 } }) }));

beforeEach(() => { logLines.length = 0; });

test('the real host on a public address is asked, pinned to the address that was checked', async () => {
  const resolve = answers('104.18.2.115');
  const fetchImpl = credits();
  await expect(readProviderBalance('openrouter', KEY, { fetchImpl, resolve })).resolves.toMatchObject({ left: 15 });
  expect(resolve).toHaveBeenCalledWith('openrouter.ai', { all: true });
  expect(fetchImpl.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/credits');
  expect(fetchImpl.mock.calls[0][1].pinnedAddresses).toEqual(['104.18.2.115']);
  expect(logLines).toEqual([{ name: 'ai-resources', level: 'info', message: 'asked the provider for a balance', meta: { provider: 'openrouter', worked: true } }]);
});

test('a host that points at a private address is refused before any call', async () => {
  for (const [provider, host] of [['openrouter', 'openrouter.ai'], ['moonshot', 'api.moonshot.ai']]) {
    const fetchImpl = credits();
    await expect(readProviderBalance(provider, KEY, { fetchImpl, resolve: answers('192.168.1.20') }))
      .rejects.toThrow(`${host} pointed at an address inside a private network, so censaiOS did not call it.`);
    expect(fetchImpl).not.toHaveBeenCalled();
  }
  expect(logLines.map((l) => l.meta)).toEqual([
    { provider: 'openrouter', worked: false, why: 'private address' },
    { provider: 'moonshot', worked: false, why: 'private address' },
  ]);
});

test('no answer from the name lookup reads as the plain "could not reach" the cloud shows', async () => {
  const fetchImpl = credits();
  await expect(readProviderBalance('moonshot', KEY, { fetchImpl, resolve: async () => [] })).rejects.toThrow('Could not reach the provider. Try again.');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(logLines[0].meta).toEqual({ provider: 'moonshot', worked: false, why: 'not found' });
});

test('a refused key is logged by reason, and the key never reaches a log line', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 401 }));
  await expect(readProviderBalance('moonshot', KEY, { fetchImpl, resolve: answers('104.18.2.115') })).rejects.toThrow('did not accept this key');
  expect(logLines[0].meta).toEqual({ provider: 'moonshot', worked: false, why: 'key refused' });
  expect(JSON.stringify(logLines)).not.toContain('FAKE');
});
