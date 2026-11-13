// Public Reddit JSON listings over the outbound guards. Used only for the
// web-browser fallback feed; the desktop app loads Reddit in a native pane.
// fetchImpl is injectable so tests never touch the network.

import { netFetch, vetHost } from './security/publicAddress.js';
import {
  feedUrlFor, normalizeSource, normalizeSort, normalizeSubreddit, postsFromListing,
} from '../shared/reddit/redditFeed.js';

const TIMEOUT_MS = 15000;
const UA = 'censaiOS:reddit-window:1.0 (public feed; +https://github.com/oogalieboogalie/Homebase)';
// Cloud hosts usually get a block page, not a listing, because this call is unsigned.
const BLOCKED_MESSAGE = 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.';
const REFUSED_MESSAGE = 'Reddit refused that feed (private, banned or restricted).';

function fail(message, why, statusCode = 502, code = 'REDDIT_REQUEST_FAILED') {
  return Object.assign(new Error(message), { why, statusCode, code });
}

async function responseBody(res) {
  if (typeof res.text === 'function') {
    try { return await res.text(); } catch { return ''; }
  }
  if (typeof res.json === 'function') {
    try { return JSON.stringify(await res.json()); } catch { return ''; }
  }
  return '';
}

function asJson(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function hasRefusalReason(listing) {
  return typeof listing?.reason === 'string' && listing.reason.trim() !== '';
}

function listingUrl(source, limit) {
  const s = normalizeSource(source);
  if (!s) throw fail('That is not a subreddit name.', 'bad subreddit', 400, 'REDDIT_BAD_SUBREDDIT');
  let path;
  if (s.type === 'home') path = '/.json';
  else if (s.type === 'popular') path = '/r/popular/hot.json';
  else path = `/r/${s.subreddit}/${s.sort}.json`;
  const target = new URL(`https://www.reddit.com${path}`);
  target.searchParams.set('limit', String(Math.min(Math.max(Number(limit) || 25, 1), 40)));
  target.searchParams.set('raw_json', '1');
  return { target, source: s };
}

export async function redditListing(subreddit, sort = 'hot', { limit = 25, fetchImpl = netFetch, resolve = null, feed } = {}) {
  const source = feed === 'home' || subreddit === 'home'
    ? { type: 'home' }
    : feed === 'popular' || subreddit === 'popular'
      ? { type: 'popular' }
      : { type: 'subreddit', subreddit, sort: normalizeSort(sort) };
  if (source.type === 'subreddit' && !normalizeSubreddit(subreddit)) {
    throw fail('That is not a subreddit name.', 'bad subreddit', 400, 'REDDIT_BAD_SUBREDDIT');
  }

  const { target, source: clean } = listingUrl(source, limit);
  const { addresses, missing, blocked } = await vetHost(target.hostname, resolve ? { resolve } : {});
  if (missing) throw fail('Could not reach Reddit.', 'not found');
  if (blocked) throw fail('Reddit pointed at a private address, so censaiOS did not call it.', 'private address');

  let res;
  try {
    res = await fetchImpl(target, {
      pinnedAddresses: addresses,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw fail(
      timedOut ? 'Reddit did not answer in time.' : 'Could not reach Reddit.',
      timedOut ? 'no answer in time' : 'not found',
    );
  }

  if (res.status === 404) throw fail(`No subreddit named r/${clean.subreddit || 'reddit'}.`, 'missing', 404, 'REDDIT_NOT_FOUND');
  if (res.status === 429) throw fail('Reddit asked us to slow down. Try again in a minute.', 'rate limited', 429, 'REDDIT_RATE_LIMIT');

  const listing = asJson(await responseBody(res));
  if (res.status === 401 || res.status === 403) {
    if (hasRefusalReason(listing)) {
      throw fail(REFUSED_MESSAGE, 'refused', res.status, 'REDDIT_REFUSED');
    }
    throw fail(BLOCKED_MESSAGE, 'blocked', res.status, 'REDDIT_BLOCKED');
  }
  if (!res.ok) throw fail('Reddit feed did not load. Try again.', `status ${res.status}`);
  if (!listing) throw fail(BLOCKED_MESSAGE, 'blocked', 502, 'REDDIT_BLOCKED');
  return {
    source: clean,
    url: feedUrlFor(clean),
    posts: postsFromListing(listing),
  };
}
