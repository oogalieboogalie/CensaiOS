// YouTube Data API v3 over the outbound guards (security/publicAddress.js):
// the name is looked up once, a private address is refused, and the
// connection is pinned to what was checked. fetchImpl is injectable so tests
// stand in for YouTube and never touch the network. The key rides on the
// request only; callers must not log the address.

import { netFetch, vetHost } from './security/publicAddress.js';

const API = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 15000;

function fail(message, why, statusCode = 502, code = 'YOUTUBE_REQUEST_FAILED') {
  return Object.assign(new Error(message), { why, statusCode, code });
}

async function youtubeFetch(url, apiKey, { fetchImpl = netFetch, resolve = null } = {}) {
  const target = new URL(url);
  target.searchParams.set('key', apiKey);
  const { addresses, missing, blocked } = await vetHost(target.hostname, resolve ? { resolve } : {});
  if (missing) throw fail('Could not reach YouTube.', 'not found');
  if (blocked) throw fail('YouTube pointed at a private address, so censaiOS did not call it.', 'private address');
  let res;
  try {
    res = await fetchImpl(target, { pinnedAddresses: addresses, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw fail(
      timedOut ? 'YouTube did not answer in time.' : 'Could not reach YouTube.',
      timedOut ? 'no answer in time' : 'not found',
    );
  }
  if (res.status === 403) {
    const body = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body)) {
      throw fail('This YouTube key has used up its daily searches. Try again tomorrow.', 'quota used up', 429, 'YOUTUBE_QUOTA_USED');
    }
    throw fail('YouTube did not accept that key.', 'key refused', 424, 'YOUTUBE_KEY_INVALID');
  }
  if (res.status === 400) {
    throw fail('YouTube did not accept that key.', 'key refused', 424, 'YOUTUBE_KEY_INVALID');
  }
  if (!res.ok) throw fail('YouTube search did not work. Try again.', `status ${res.status}`);
  return res.json();
}

function mapVideo(item) {
  const videoId = item.id?.videoId;
  const snippet = item.snippet || {};
  return {
    id: videoId,
    title: snippet.title || 'Untitled video',
    channelTitle: snippet.channelTitle || '',
    description: snippet.description || '',
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
    embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : '',
    publishedAt: snippet.publishedAt || null,
  };
}

export async function youtubeSearch(apiKey, { query, shorts = false, maxResults = 10, fetchImpl, resolve } = {}) {
  const url = new URL(`${API}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', query);
  if (shorts) url.searchParams.set('videoDuration', 'short');
  url.searchParams.set('maxResults', String(Math.min(Number(maxResults) || 10, 25)));
  const data = await youtubeFetch(url, apiKey, { fetchImpl, resolve });
  const items = (data.items || []).map(mapVideo).filter((item) => item.id);
  return { items, pageInfo: data.pageInfo || null };
}

export async function youtubeChannel(apiKey, handle, { fetchImpl, resolve } = {}) {
  const url = new URL(`${API}/channels`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('forHandle', handle);
  url.searchParams.set('maxResults', '1');
  const data = await youtubeFetch(url, apiKey, { fetchImpl, resolve });
  const channel = data.items?.[0];
  if (!channel?.id) return null;
  return { channelId: channel.id, name: channel.snippet?.title || handle };
}
