// Thin Tavily client for LeadHound. Key resolution is BYOK-first: the
// signed-in user's vaulted Tavily key, then the server's TAVILY_API_KEY.
// `fetchImpl` is injectable so tests never touch the network.

import { getSecret } from '../secrets.js';

const TAVILY_BASE = 'https://api.tavily.com';

// TAVILY_API_BASE points LeadHound at a stand-in Tavily for local demos and
// end-to-end tests; real installs leave it unset.
export function tavilyBase() {
  return (process.env.TAVILY_API_BASE || TAVILY_BASE).replace(/\/+$/, '');
}

// How long one Tavily call may take before LeadHound gives up on it.
export function tavilyTimeoutMs() {
  const n = Number(process.env.TAVILY_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30000;
}

// Plain-words errors for the window (and for agents using Tavily as a tool).
export function tavilyError(status) {
  if (status === 401 || status === 403) {
    return Object.assign(new Error('Tavily did not accept that API key. Paste a fresh key from app.tavily.com and try again.'), {
      statusCode: 424, code: 'TAVILY_KEY_INVALID',
    });
  }
  if (status === 429) {
    return Object.assign(new Error('Tavily is rate limiting this key. Wait a minute and run the hunt again.'), {
      statusCode: 429, code: 'TAVILY_RATE_LIMITED',
    });
  }
  if (status === 432 || status === 433) {
    return Object.assign(new Error('This Tavily key is out of credits for the month. Add credits at app.tavily.com or paste another key.'), {
      statusCode: 424, code: 'TAVILY_OUT_OF_CREDITS',
    });
  }
  return Object.assign(new Error(`Tavily had a problem on its side (${status}). Try again in a moment.`), {
    statusCode: 502, code: 'TAVILY_REQUEST_FAILED',
  });
}

export async function resolveTavilyKey(userId, { loadUserKey } = {}) {
  const load = loadUserKey || (async (id) => {
    const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
    return getUserApiKeyConfig(id, 'tavily');
  });
  try {
    const userKey = userId ? await load(userId) : null;
    if (userKey?.apiKey) return { apiKey: userKey.apiKey, source: 'byok' };
  } catch {
    // A vault read failure falls through to the server key.
  }
  const serverKey = getSecret('TAVILY_API_KEY');
  if (serverKey) return { apiKey: serverKey, source: 'server' };
  return { apiKey: '', source: null };
}

export function createTavilyClient(apiKey, { fetchImpl = globalThis.fetch, timeoutMs = tavilyTimeoutMs(), purpose = 'run LeadHound' } = {}) {
  if (!apiKey) {
    throw Object.assign(new Error(`Add a Tavily API key to ${purpose}.`), {
      statusCode: 424,
      code: 'TAVILY_KEY_REQUIRED',
    });
  }

  async function call(pathname, body) {
    let res;
    try {
      res = await fetchImpl(`${tavilyBase()}/${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw Object.assign(new Error(timedOut
        ? 'Tavily took too long to answer. Check the internet connection and run the hunt again.'
        : 'Could not reach Tavily. Check the internet connection and run the hunt again.'), {
        statusCode: 504, code: timedOut ? 'TAVILY_TIMEOUT' : 'TAVILY_UNREACHABLE',
      });
    }
    if (!res.ok) throw tavilyError(res.status);
    return res.json();
  }

  return {
    async search(query, { maxResults = 6 } = {}) {
      const data = await call('search', {
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: false,
      });
      return Array.isArray(data?.results) ? data.results : [];
    },
    async extract(url, query = '') {
      const data = await call('extract', { urls: [url], query, extract_depth: 'basic' });
      return ((data?.results || [])[0] || {}).raw_content || '';
    },
    // The Research window's search: depth and answer are the user's call,
    // and the whole response (answer + results) comes back.
    async searchFull(query, { depth = 'basic', includeAnswer = true, maxResults = 8, topic = 'general' } = {}) {
      const data = await call('search', {
        query,
        search_depth: depth === 'advanced' ? 'advanced' : 'basic',
        include_answer: includeAnswer ? (depth === 'advanced' ? 'advanced' : 'basic') : false,
        max_results: Math.min(20, Math.max(1, Number(maxResults) || 8)),
        topic: topic === 'news' ? 'news' : 'general',
      });
      return { answer: data?.answer || '', results: Array.isArray(data?.results) ? data.results : [] };
    },
    // Full page text for up to 20 urls in one call: url -> raw_content.
    async extractMany(urls) {
      const list = [...new Set((urls || []).filter(Boolean))].slice(0, 20);
      if (!list.length) return new Map();
      const data = await call('extract', { urls: list, extract_depth: 'basic' });
      return new Map((data?.results || []).filter((r) => r?.url).map((r) => [r.url, r.raw_content || '']));
    },
  };
}
