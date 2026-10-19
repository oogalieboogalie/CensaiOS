// shopgoodwill.com. It has no public developer API: its own search pages load
// their listings from a search service (buyerapi.shopgoodwill.com) without a
// key, and that is what the watcher reads, the same answer a visitor's
// browser gets. Listings come back either as that service's JSON or inside a
// search page's saved page state (<script id="serverApp-state">); the parser
// takes both and ignores anything it does not recognise.

import { standInHosts } from '../fetcher.js';

const API = 'https://buyerapi.shopgoodwill.com/api/Search/ItemListing';
const ITEM_URL = 'https://shopgoodwill.com/item/';
const IMAGE_BASE = 'https://shopgoodwillimages.azureedge.net/production/';

export function goodwillApi(env = process.env) {
  return env.AUCTION_WATCHER_GOODWILL_API || API;
}

/** The search the site's own listing page sends, for one watch. */
export function goodwillSearchBody({ query, maxPrice = null, closed = false, pageSize = 40 }) {
  return {
    searchText: String(query || ''),
    selectedGroup: '', selectedCategoryIds: '', selectedSellerIds: '', catIds: '', partNumber: '',
    lowPrice: '0', highPrice: maxPrice ? String(Math.ceil(maxPrice)) : '999999',
    searchBuyNowOnly: '', searchPickupOnly: 'false', searchNoPickupOnly: 'false', searchOneCentShippingOnly: 'false',
    searchDescriptions: 'false', searchClosedAuctions: closed ? 'true' : 'false', closedAuctionDaysBack: '30',
    searchCanadaShipping: 'false', searchInternationalShippingOnly: 'false', searchUSOnlyShipping: 'false',
    sortColumn: closed ? '2' : '1', sortDescending: closed ? 'true' : 'false',
    page: '1', pageSize: String(pageSize), savedSearchId: 0, useBuyerPrefs: 'true',
    categoryLevelNo: '1', categoryLevel: 1, categoryId: 0,
    isSize: false, isWeddingCatagory: 'false', isMultipleCategoryIds: false, isFromHeaderMenuTab: false, isFromHomePage: false, layout: '',
  };
}

// Goodwill writes end times in Pacific time with no zone; make them exact.
export function pacificToIso(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const asUtc = new Date(`${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(asUtc).find((p) => p.type === 'timeZoneName')?.value || 'GMT-8';
  const [, sign = '-', hours = '8', minutes = '0'] = name.match(/GMT([+-])(\d+)(?::(\d+))?/) || [];
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60000;
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

/** A Goodwill photo address: full https ones as they are, site paths on its image server. */
export function goodwillPhoto(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  // A stand-in photo server for demos and proofs (see fetcher.js).
  if (/^http:\/\/[^/]+\//i.test(raw) && standInHosts().includes(raw.split('/')[2].split(':')[0])) return raw;
  if (/^http:\/\//i.test(raw) || raw.includes('://')) return null;
  return IMAGE_BASE + raw.replace(/^\/+/, '');
}

const imageUrl = (item) => goodwillPhoto(item.imageURL || item.imageUrl || item.imageServer);

const number = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (v !== null && v !== undefined && v !== '' && Number.isFinite(n)) return n;
  }
  return null;
};

/** One Goodwill item as the watcher's listing shape, or null when it is not one. */
export function goodwillListing(item) {
  const id = item?.itemId ?? item?.itemID ?? item?.id;
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
  if (id === undefined || id === null || !/^\d{1,12}$/.test(String(id)) || !title) return null;
  const buyNow = number(item.buyNowPrice);
  return {
    id: String(id),
    title: title.slice(0, 300),
    price: number(item.currentPrice, item.minimumBid, item.startingPrice, buyNow),
    currency: 'USD',
    endsAt: pacificToIso(item.endTime || item.endDate),
    imageUrl: imageUrl(item),
    url: `${ITEM_URL}${id}`,
    bids: number(item.numBids, item.numberOfBids),
    buyNow: buyNow && buyNow > 0 ? buyNow : null,
  };
}

// Angular keeps page state as JSON, with quotes written as &q; in older builds.
function pageState(html) {
  const m = html.match(/<script[^>]*id="(?:serverApp-state|ng-state)"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  const text = m[1].replace(/&q;/g, '"').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>').replace(/&a;/g, '&');
  try { return JSON.parse(text); } catch { return null; }
}

function findItems(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return [];
  if (Array.isArray(node)) {
    if (node.some((x) => x && typeof x === 'object' && ('itemId' in x || 'itemID' in x) && 'title' in x)) return node;
    for (const child of node) {
      const found = findItems(child, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  for (const value of Object.values(node)) {
    const found = findItems(value, depth + 1);
    if (found.length) return found;
  }
  return [];
}

/**
 * Listings from a Goodwill reply: the search service's JSON (text or object)
 * or a search page's HTML. Unknown shapes give an empty list, never a throw.
 */
export function parseGoodwill(body) {
  let data = body;
  if (typeof body === 'string') {
    const text = body.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try { data = JSON.parse(text); } catch { data = null; }
    } else {
      data = pageState(text);
    }
  }
  const seen = new Set();
  return findItems(data).map(goodwillListing).filter((l) => l && !seen.has(l.id) && seen.add(l.id));
}

/** Search Goodwill for one watch. `fetch` is siteFetch bound by the caller. */
export async function searchGoodwill({ query, maxPrice, closed = false }, { fetch }) {
  const reply = await fetch('shopgoodwill', goodwillApi(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goodwillSearchBody({ query, maxPrice, closed })),
  });
  return { listings: parseGoodwill(reply.text), cached: Boolean(reply.cached) };
}
