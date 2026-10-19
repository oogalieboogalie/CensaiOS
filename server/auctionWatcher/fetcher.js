// The only way the Auction Watcher talks to the internet.
//
// - Only shopgoodwill.com's search service and eBay's API, nothing else
//   (plus the two sites' photo servers, for photos the person asked about).
// - Every address goes through the reachability guard first
//   (server/outsideTools/netGuard.js), the connection is pinned to the
//   address it checked where that matters, and redirects are not followed.
// - It says who it is (a plain user agent) and keeps a reply for 5 minutes,
//   so two watches with the same words cost the site one request. That is
//   shorter than the shortest check interval, so a timed check is never
//   answered from an old copy.
// - Requests to one site wait for each other with a few seconds between them.

import { reachableFetch } from '../outsideTools/netGuard.js';
import { AuctionError, refusalFor } from './errors.js';

export const USER_AGENT = 'censaiOS-AuctionWatcher/1.0 (personal watch list; checks each search at most every 15 minutes)';
export const CACHE_MS = 5 * 60 * 1000;
const GAP_MS = 4000;
const TIMEOUT_MS = 20000;

const KNOWN_HOSTS = ['buyerapi.shopgoodwill.com', 'shopgoodwill.com', 'api.ebay.com'];

// A stand-in site for demos and proofs (AUCTION_WATCHER_GOODWILL_API /
// AUCTION_WATCHER_EBAY_API), set by whoever runs this computer.
export function standInHosts(env = process.env) {
  return [env.AUCTION_WATCHER_GOODWILL_API, env.AUCTION_WATCHER_EBAY_API]
    .filter(Boolean)
    .map((value) => { try { return new URL(value).hostname; } catch { return null; } })
    .filter(Boolean);
}

export function allowedHost(hostname, env = process.env) {
  return KNOWN_HOSTS.includes(hostname) || standInHosts(env).includes(hostname);
}

const PHOTO_HOSTS = ['shopgoodwillimages.azureedge.net', 'i.ebayimg.com'];
const PHOTO_TYPES = /^image\/(jpeg|png|webp|gif)$/;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/**
 * One listing photo as a data: URL for the model, or null when it is not a
 * usable photo. Only the two sites' photo servers, https, no redirects, at
 * most 3 MB, never kept.
 */
export async function fetchPhoto(url, { fetchImpl = null, env = process.env } = {}) {
  let guarded;
  try {
    guarded = await reachableFetch(url);
  } catch {
    return null;
  }
  const { hostname, protocol } = guarded.url;
  const standIn = standInHosts(env).includes(hostname);
  if (!standIn && !(PHOTO_HOSTS.includes(hostname) && protocol === 'https:')) return null;
  try {
    const res = await (fetchImpl || guarded.fetchImpl)(guarded.url.href, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg, image/png, image/webp' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = String(res.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    if (res.status !== 200 || !PHOTO_TYPES.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

const cache = new Map();
const lastCall = new Map();
let queue = Promise.resolve();

async function politeTurn(host, now = Date.now) {
  const turn = queue.then(async () => {
    const wait = (lastCall.get(host) || 0) + GAP_MS - now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall.set(host, now());
  });
  queue = turn.catch(() => {});
  return turn;
}

/**
 * One request to a known site. `site` names it in errors ("Goodwill").
 * Returns { status, text } for a 2xx answer; throws AuctionError otherwise.
 */
export async function siteFetch(site, url, {
  method = 'GET', headers = {}, body, fetchImpl = null, cacheMs = CACHE_MS, gap = true, now = Date.now,
} = {}) {
  const guarded = await reachableFetch(url).catch((err) => {
    throw new AuctionError(err.message, { status: 400, code: 'blocked_address' });
  });
  const parsed = guarded.url;
  if (!allowedHost(parsed.hostname)) {
    throw new AuctionError('The Auction Watcher only checks shopgoodwill.com and eBay.', { status: 400, code: 'unknown_site' });
  }
  const key = `${method} ${parsed.href} ${body || ''}`;
  const hit = cache.get(key);
  if (cacheMs > 0 && hit && now() - hit.at < cacheMs) return { ...hit.reply, cached: true };

  if (gap) await politeTurn(parsed.hostname, now);
  let res;
  try {
    res = await (fetchImpl || guarded.fetchImpl)(parsed.href, {
      method,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/html;q=0.8', ...headers },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const slow = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new AuctionError(slow ? 'The site took too long to answer. censaiOS will try again at the next check.'
      : 'Could not reach the site. Check the internet connection.', { status: 502, code: 'unreachable' });
  }
  if (res.status < 200 || res.status >= 300) throw Object.assign(refusalFor(site, res.status), { siteStatus: res.status });
  const reply = { status: res.status, text: await res.text() };
  if (cacheMs > 0) cache.set(key, { at: now(), reply });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return reply;
}

/** Test helper. */
export function resetSiteFetch() {
  cache.clear();
  lastCall.clear();
  queue = Promise.resolve();
}
