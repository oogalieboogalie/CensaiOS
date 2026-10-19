// A listing's own description (the seller's text under the photos) and its
// photo addresses. Timed checks read the description once per listing: lock
// wording ("supervisor password", "tamper detected") is often only there, not
// in the title. The photos are only looked at when the person presses
// "AI pros and cons".

import { createLogger } from '../logger.js';
import { ebayKeyFor } from './ebayKey.js';
import { siteFetch } from './fetcher.js';
import { goodwillApi, goodwillPhoto } from './sites/goodwill.js';
import { getEbayItem } from './sites/ebay.js';

const log = createLogger('auction-watcher');

const plain = (html) => String(html || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Photo addresses in a Goodwill item detail reply (the site has used a few shapes). */
export function goodwillPhotos(data) {
  const raw = [
    ...String(data?.imageUrlString || '').split(';'),
    ...(Array.isArray(data?.images) ? data.images.map((i) => (typeof i === 'string' ? i : i?.url || i?.imageURL || i?.imageUrl)) : []),
  ];
  return [...new Set(raw.map((v) => goodwillPhoto(v)).filter(Boolean))];
}

/**
 * The description and photo addresses of one listing ({ site, listing_id,
 * user_id }), best effort: '' and [] when the site does not give them. Like
 * every call, it waits its turn behind the few seconds kept between calls to
 * one site. With `stopOnRefusal`, a site that said no (401/403/429) is passed
 * on so the timed check stops and pauses instead of asking again.
 */
export async function listingDetail(match, { fetch = siteFetch, loadKey, stopOnRefusal = false } = {}) {
  try {
    if (match.site === 'ebay') {
      const item = await getEbayItem(match.listing_id, { key: await ebayKeyFor(match.user_id, { loadKey }), fetch, gap: true });
      return { description: plain(item.text).slice(0, 4000), photos: item.photos };
    }
    const origin = new URL(goodwillApi()).origin;
    const reply = await fetch('shopgoodwill', `${origin}/api/ItemDetail/GetItemDetailModelByItemId/${encodeURIComponent(match.listing_id)}`);
    const data = JSON.parse(reply.text || '{}');
    return { description: plain(data.description || data.itemDescription || '').slice(0, 4000), photos: goodwillPhotos(data) };
  } catch (err) {
    if (stopOnRefusal && err.refused) throw err;
    log.info('listing description not available', { matchId: match.id, listingId: match.listing_id, site: match.site, error: err.message });
    return { description: '', photos: [] };
  }
}

/** Just the description (the timed checks). */
export async function listingDescription(match, options) {
  return (await listingDetail(match, options)).description;
}
