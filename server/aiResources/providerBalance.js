// Asking the provider itself how much is left, where a provider answers that
// with an ordinary API key. Only OpenRouter and Moonshot (Kimi) do today;
// Anthropic, OpenAI, Google and xAI only show balances in their own web
// consoles (or to admin keys), so for those the window keeps its estimate.
// Runs only when the person presses "Ask the provider"; the reading is free.
// The addresses are fixed here, and every call goes through the app's
// outbound checks (security/publicAddress.js): the name is looked up once,
// a private address is refused, and the connection is pinned to what was
// checked. One 'ai-resources' line per ask: the provider, worked or why not.

import { netFetch, vetHost } from '../security/publicAddress.js';
import { createLogger } from '../logger.js';

const log = createLogger('ai-resources');
const TIMEOUT_MS = 10_000;
const plain = (message) => Object.assign(new Error(message), { plain: true });
const refused = (why, message) => Object.assign(plain(message), { why });

async function getJson(url, apiKey, { fetchImpl, resolve }) {
  const host = new URL(url).hostname;
  const { addresses, missing, blocked } = await vetHost(host, resolve ? { resolve } : {});
  if (missing) throw refused('not found', 'Could not reach the provider. Try again.');
  if (blocked) throw refused('private address', `${host} pointed at an address inside a private network, so censaiOS did not call it.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal, pinnedAddresses: addresses });
    if (!res.ok) throw Object.assign(new Error(`The provider said no (${res.status}).`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const READERS = {
  async openrouter(apiKey, how) {
    const credits = await getJson('https://openrouter.ai/api/v1/credits', apiKey, how).catch((error) => {
      if (error?.why) throw error;
      return null;
    });
    if (credits?.data && Number.isFinite(Number(credits.data.total_credits))) {
      const total = Number(credits.data.total_credits);
      const used = Number(credits.data.total_usage) || 0;
      return { currency: 'USD', total, used, left: total - used, what: 'Account credits' };
    }
    const key = (await getJson('https://openrouter.ai/api/v1/key', apiKey, how))?.data || {};
    const limit = key.limit == null ? null : Number(key.limit);
    return {
      currency: 'USD',
      total: limit,
      used: Number(key.usage) || 0,
      left: key.limit_remaining == null ? null : Number(key.limit_remaining),
      what: limit == null ? 'This key has no spending limit' : 'This key\'s spending limit',
    };
  },
  async moonshot(apiKey, how) {
    const data = (await getJson('https://api.moonshot.ai/v1/users/me/balance', apiKey, how))?.data || {};
    return { currency: 'USD', total: null, used: null, left: Number(data.available_balance), what: 'Account balance' };
  },
};

export function providerAnswersBalance(provider) {
  return Object.prototype.hasOwnProperty.call(READERS, provider);
}

/** { currency, total, used, left, what } from the provider, or throws in plain words. */
export async function readProviderBalance(provider, apiKey, { fetchImpl = netFetch, resolve = null } = {}) {
  const reader = READERS[provider];
  if (!reader) throw plain('This provider does not tell apps how much is left. Check its own website.');
  try {
    const reading = await reader(apiKey, { fetchImpl, resolve });
    if (reading.left != null && !Number.isFinite(reading.left)) reading.left = null;
    log.info('asked the provider for a balance', { provider, worked: true });
    return reading;
  } catch (error) {
    const keyRefused = error?.status === 401 || error?.status === 403;
    const why = error?.why || (error?.name === 'AbortError' ? 'no answer in time' : keyRefused ? 'key refused' : 'could not reach it');
    log.warn('asked the provider for a balance', { provider, worked: false, why });
    if (error?.why) throw error;
    if (error?.name === 'AbortError') throw plain('The provider did not answer in time. Try again.');
    throw plain(keyRefused ? 'The provider did not accept this key.' : 'Could not reach the provider. Try again.');
  }
}
