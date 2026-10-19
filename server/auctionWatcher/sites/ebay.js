// eBay through its Browse API, with the person's own free developer keys
// (developer.ebay.com: an App ID and a Cert ID, saved as one "ebay" key in the
// key vault as "AppID:CertID"). Nothing here works without that key.
//
// Sold prices: only eBay's Marketplace Insights API has them, and eBay opens
// it to approved apps only. The watcher asks once; when eBay says no, it says
// "no sale history" instead of guessing a number.

import { createHash } from 'node:crypto';
import { AuctionError } from '../errors.js';

const API = 'https://api.ebay.com';

export function ebayApi(env = process.env) {
  return (env.AUCTION_WATCHER_EBAY_API || API).replace(/\/+$/, '');
}

/** "AppID:CertID" (or the two on separate lines) into its parts. */
export function parseEbayKey(value) {
  const text = String(value || '').trim();
  const cut = text.includes('\n') ? text.indexOf('\n') : text.indexOf(':');
  if (cut < 1) return null;
  const clientId = text.slice(0, cut).trim();
  const clientSecret = text.slice(cut + 1).trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const tokens = new Map();

async function appToken(key, scope, { fetch, now = Date.now }) {
  // Both halves of the key name the cached token, so nobody gets someone
  // else's token by typing their App ID.
  const cacheKey = createHash('sha256').update(`${key.clientId}\n${key.clientSecret}\n${scope}`).digest('hex');
  const hit = tokens.get(cacheKey);
  if (hit && hit.until > now()) return hit.token;
  const basic = Buffer.from(`${key.clientId}:${key.clientSecret}`).toString('base64');
  const reply = await fetch('ebay', `${ebayApi()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
    cacheMs: 0,
    gap: false,
  }).catch((err) => {
    if (![400, 401, 403].includes(err.siteStatus)) throw err;
    throw new AuctionError('eBay did not accept the saved App ID and Cert ID. Paste them again from developer.ebay.com (Production keys).', {
      status: 400, code: 'ebay_key', refused: true,
    });
  });
  const data = JSON.parse(reply.text || '{}');
  if (!data.access_token) throw new Error('eBay did not hand back a token.');
  tokens.set(cacheKey, { token: data.access_token, until: now() + Math.max(60, (Number(data.expires_in) || 7200) - 120) * 1000 });
  return data.access_token;
}

const money = (m) => (m && Number.isFinite(Number(m.value)) ? Number(m.value) : null);

function safeEbayUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && (url.hostname === 'ebay.com' || url.hostname.endsWith('.ebay.com')) ? url.href : null;
  } catch { return null; }
}

/** One Browse API item summary as the watcher's listing shape. */
export function ebayListing(item) {
  const id = String(item?.itemId || '').trim();
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
  if (!id || !title) return null;
  const auction = (item.buyingOptions || []).includes('AUCTION');
  const image = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null;
  return {
    id: id.slice(0, 80),
    title: title.slice(0, 300),
    price: money(item.currentBidPrice) ?? money(item.price),
    currency: item.currentBidPrice?.currency || item.price?.currency || 'USD',
    endsAt: item.itemEndDate ? new Date(item.itemEndDate).toISOString() : null,
    imageUrl: image && /^https:\/\//i.test(image) ? image : null,
    url: safeEbayUrl(item.itemWebUrl) || `https://www.ebay.com/itm/${encodeURIComponent(id.split('|')[1] || id)}`,
    bids: Number.isFinite(Number(item.bidCount)) ? Number(item.bidCount) : null,
    buyNow: auction ? null : money(item.price),
  };
}

export function parseEbaySearch(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { return []; }
  return (data?.itemSummaries || []).map(ebayListing).filter(Boolean);
}

/** Search eBay for one watch with the person's key. */
export async function searchEbay({ query, maxPrice }, { key, fetch }) {
  const token = await appToken(key, 'https://api.ebay.com/oauth/api_scope', { fetch });
  // Newest first, so a listing that just went up is always in the page and
  // an old one never turns "new" by drifting into it.
  const params = new URLSearchParams({ q: String(query), limit: '50', sort: 'newlyListed' });
  if (maxPrice) params.set('filter', `price:[..${Math.ceil(maxPrice)}],priceCurrency:USD`);
  const reply = await fetch('ebay', `${ebayApi()}/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    gap: false,
  });
  return { listings: parseEbaySearch(reply.text), cached: Boolean(reply.cached) };
}

/** The most recent eBay sale for these words, or { none: reason }. */
export async function ebayLastSold({ query }, { key, fetch }) {
  let token;
  try {
    token = await appToken(key, 'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights', { fetch });
  } catch {
    return { none: 'No sale history: eBay only shares sold prices with developer apps it has approved for that.' };
  }
  const params = new URLSearchParams({ q: String(query), limit: '5' });
  const reply = await fetch('ebay', `${ebayApi()}/buy/marketplace_insights/v1_beta/item_sales/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    gap: false,
  }).catch(() => null);
  const data = reply ? JSON.parse(reply.text || '{}') : {};
  const sale = (data.itemSales || []).find((s) => money(s.lastSoldPrice) !== null);
  if (!sale) return { none: 'No sale history on eBay for these words.' };
  return {
    price: money(sale.lastSoldPrice),
    currency: sale.lastSoldPrice.currency || 'USD',
    soldAt: sale.lastSoldDate || null,
    title: String(sale.title || '').slice(0, 200),
    where: 'eBay',
  };
}

/** One item's own description (HTML) and photo addresses, for the red flag check and the AI pros and cons. */
export async function getEbayItem(itemId, { key, fetch, gap = false }) {
  const token = await appToken(key, 'https://api.ebay.com/oauth/api_scope', { fetch });
  const reply = await fetch('ebay', `${ebayApi()}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    gap,
  });
  const item = JSON.parse(reply.text || '{}');
  const photos = [item.image, ...(Array.isArray(item.additionalImages) ? item.additionalImages : [])]
    .map((i) => i?.imageUrl).filter((u) => typeof u === 'string' && /^https:\/\//i.test(u));
  return { text: [item.conditionDescription, item.shortDescription, item.description].filter(Boolean).join(' '), photos };
}

/** Test helper. */
export function resetEbayTokens() {
  tokens.clear();
}
