// Public Reddit JSON listings over the outbound guards. Used only for the
// web-browser fallback feed; the desktop app loads Reddit in a native pane.
// fetchImpl is injectable so tests never touch the network.

import { netFetch, vetHost } from './security/publicAddress.js';
import {
  feedUrlFor, normalizeSource, normalizeSort, normalizeSubreddit, postsFromListing,
} from '../shared/reddit/redditFeed.js';

const TIMEOUT_MS = 15000;
const UA = 'censaiOS:reddit-window:1.0 (public feed; +https://github.com/oogalieboogalie/Homebase)';

function fail(message, why, statusCode = 502, code = 'REDDIT_REQUEST_FAILED') {
  return Object.assign(new Error(message), { why, statusCode, code });
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
  if (res.status === 403) throw fail('Reddit refused that feed (private or banned).', 'refused', 403, 'REDDIT_REFUSED');
  if (res.status === 429) throw fail('Reddit asked us to slow down. Try again in a minute.', 'rate limited', 429, 'REDDIT_RATE_LIMIT');
  if (!res.ok) throw fail('Reddit feed did not load. Try again.', `status ${res.status}`);

  const listing = await res.json();
  return {
    source: clean,
    url: feedUrlFor(clean),
    posts: postsFromListing(listing),
  };
}
