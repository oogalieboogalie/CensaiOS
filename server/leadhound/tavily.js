// Thin Tavily client for LeadHound. Key resolution is BYOK-first: the
// signed-in user's vaulted Tavily key, then the server's TAVILY_API_KEY.
// `fetchImpl` is injectable so tests never touch the network.

import { getSecret } from '../secrets.js';

const TAVILY_BASE = 'https://api.tavily.com';

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

export function createTavilyClient(apiKey, { fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) {
    throw Object.assign(new Error('Add a Tavily API key to run LeadHound.'), {
      statusCode: 424,
      code: 'TAVILY_KEY_REQUIRED',
    });
  }

  async function call(pathname, body) {
    const res = await fetchImpl(`${TAVILY_BASE}/${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const code = res.status === 401 ? 'TAVILY_KEY_INVALID' : 'TAVILY_REQUEST_FAILED';
      throw Object.assign(new Error(`Tavily ${pathname} failed (${res.status})`), {
        statusCode: res.status === 401 ? 424 : 502,
        code,
      });
    }
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
  };
}
