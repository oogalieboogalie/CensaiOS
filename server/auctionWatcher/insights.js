// On-demand extras for one match, only when the person presses the button:
// - AI pros and cons, written by the person's own saved model key;
// - the last sold price for the watch's words (Goodwill's ended auctions, or
//   eBay with the person's own key), or a plain "no sale history".
// The pros and cons read the listing's description and look at up to 4 of its
// photos, so a lock that shows only on a photo of the screen ("supervisor
// password", "tamper detected") is caught too, when the model can see pictures.

import { fetchPhoto, siteFetch } from './fetcher.js';
import { redFlags } from './match.js';
import { searchGoodwill } from './sites/goodwill.js';
import { ebayLastSold } from './sites/ebay.js';
import { ebayKeyFor } from './ebayKey.js';
import { listingDetail } from './details.js';

const MAX_PHOTOS = 4;

export function insightsPrompt(match, description, photos = []) {
  const price = match.price === null ? 'unknown' : `$${Number(match.price).toFixed(2)}`;
  const text = `Site: ${match.site === 'ebay' ? 'eBay' : 'shopgoodwill.com'}\nTitle: ${match.title}\nCurrent price: ${price}\nBids: ${match.bids ?? 'unknown'}\nDescription: ${description || '(the site did not give a description)'}${photos.length ? `\nThe listing's photos (${photos.length}) follow.` : ''}`;
  return [
    { role: 'system', content: 'You help a careful buyer judge one used-item auction listing. Answer with JSON only: {"pros": [up to 3 short strings], "cons": [up to 3 short strings], "verdict": "one plain sentence", "photoLock": ""}. Plain words, no jargon. If the text mentions a supervisor password, BIOS lock, tamper detection, activation lock or remote management, the first con must say the machine may stay locked. If any photo clearly shows a screen asking for a password at power on, a supervisor or BIOS password prompt, a tamper detected message, an activation lock or a remote management lock, set "photoLock" to one short sentence saying which photo and what it shows, and make the first con say so; otherwise leave it "".' },
    { role: 'user', content: photos.length ? [{ type: 'text', text }, ...photos.map((url) => ({ type: 'image_url', image_url: { url } }))] : text },
  ];
}

export function parseInsights(text) {
  const raw = String(text || '');
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let data;
  try { data = JSON.parse(json); } catch { data = {}; }
  const list = (v) => (Array.isArray(v) ? v : []).map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 3);
  const out = { pros: list(data.pros), cons: list(data.cons), verdict: String(data.verdict || '').trim().slice(0, 300) };
  const photoLock = typeof data.photoLock === 'string' ? data.photoLock.trim().slice(0, 200) : '';
  if (photoLock) out.photoLock = photoLock;
  if (!out.pros.length && !out.cons.length && !out.verdict) out.verdict = raw.trim().slice(0, 300) || 'The model gave no answer.';
  return out;
}

/** Up to 4 of the listing's photos as data: URLs (its own card picture first). */
export async function listingPhotos(match, addresses, { photo = fetchPhoto } = {}) {
  const wanted = [...new Set([match.image_url, ...addresses].filter(Boolean))].slice(0, MAX_PHOTOS);
  const out = [];
  for (const url of wanted) {
    const data = await photo(url);
    if (data) out.push(data);
  }
  return out;
}

/**
 * Pros, cons and a verdict for one match row (joined with its watch), with
 * the photos when there are any. A model that cannot take pictures is asked
 * again with the words only, and the card says the photos were not checked.
 */
export async function matchInsights(match, { complete, fetch, loadKey, photo, now = () => new Date() }) {
  const { description, photos: addresses } = await listingDetail(match, { fetch, loadKey });
  const photos = await listingPhotos(match, addresses, { photo });
  const options = { maxTokens: 600, temperature: 0.2 };
  let reply;
  let photosNote = photos.length ? null : 'No photos could be loaded, so only the words were checked.';
  try {
    reply = await complete(insightsPrompt(match, description, photos), options);
  } catch (err) {
    if (!photos.length) throw err;
    reply = await complete(insightsPrompt(match, description), options);
    photosNote = 'Your chat model could not look at the photos, so only the words were checked.';
  }
  const answer = parseInsights(reply);
  const flags = redFlags(match.title, description);
  if (answer.photoLock && !photosNote) flags.push('lock seen in a photo');
  else delete answer.photoLock;
  return {
    ...answer, redFlags: flags, readDescription: Boolean(description),
    photosChecked: photosNote ? 0 : photos.length, photosNote, at: now().toISOString(),
  };
}

/** The most recent sale for the watch's words, or { none } in plain words. */
export async function lastSold(match, { fetch = siteFetch, loadKey } = {}) {
  const query = match.query;
  if (match.site === 'ebay') {
    return { query, ...(await ebayLastSold({ query }, { key: await ebayKeyFor(match.user_id, { loadKey }), fetch })) };
  }
  const { listings } = await searchGoodwill({ query, closed: true }, { fetch });
  const sold = listings.find((l) => Number(l.bids) > 0 && Number.isFinite(l.price));
  if (!sold) return { query, none: 'No sale history on Goodwill for these words in the last 30 days.' };
  return { query, price: sold.price, currency: 'USD', soldAt: sold.endsAt, title: sold.title, where: 'Goodwill' };
}
