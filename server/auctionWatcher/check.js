// One check of one watch: ask the site, keep the listings that match, read
// the descriptions of the new ones, save them, and write down how it went (or
// pause the watch when the site said no). Every check leaves one line in the
// app log ('auction-watcher').

import { createLogger } from '../logger.js';
import { AuctionError } from './errors.js';
import { ebayKeyFor } from './ebayKey.js';
import { listingDescription } from './details.js';
import { siteFetch } from './fetcher.js';
import { matchesWatch, redFlags } from './match.js';
import { searchGoodwill } from './sites/goodwill.js';
import { searchEbay } from './sites/ebay.js';
import { knownListings, recordCheck, saveMatches } from './store.js';

const log = createLogger('auction-watcher');
const MAX_SAVED_PER_CHECK = 60;
// Descriptions read per check, a few seconds apart. Each listing is read once.
export const DESCRIPTIONS_PER_CHECK = 5;

/** Listings on the site for this watch's words (already filtered to matches). */
export async function findListings(watch, { fetch = siteFetch, loadKey } = {}) {
  const query = watch.query;
  const maxPrice = watch.max_price === null || watch.max_price === undefined ? null : Number(watch.max_price);
  const found = watch.site === 'ebay'
    ? await searchEbay({ query, maxPrice }, { key: await ebayKeyFor(watch.user_id, { loadKey }), fetch })
    : await searchGoodwill({ query, maxPrice }, { fetch });
  const listings = found.listings
    .filter((l) => matchesWatch(l, watch))
    .slice(0, MAX_SAVED_PER_CHECK)
    .map((l) => ({ ...l, redFlags: redFlags(l.title) }));
  return { listings, total: found.listings.length, cached: found.cached };
}

/**
 * Read the descriptions of listings this watch has not read yet (new ones
 * first), so lock wording and the "must not mention" words that only appear
 * there count too. A listing whose description fails a word is kept as
 * skipped: never shown, never announced, never read again.
 */
export async function readDescriptions(watch, listings, known, { fetch, loadKey, describe = listingDescription } = {}) {
  const unread = [
    ...listings.filter((l) => !known.has(l.id)),
    ...listings.filter((l) => known.get(l.id)?.read === false),
  ].slice(0, DESCRIPTIONS_PER_CHECK);
  for (const l of unread) {
    const text = await describe({ site: watch.site, listing_id: l.id, user_id: watch.user_id }, { fetch, loadKey, stopOnRefusal: true });
    l.detailsRead = true;
    l.redFlags = redFlags(l.title, text);
    l.skipped = !matchesWatch(l, watch, text);
  }
  return new Set(unread.map((l) => l.id));
}

/**
 * Check one watch row (from the database). Returns { fresh, total, note }.
 * Never throws for a site problem: it is written on the watch instead.
 */
export async function checkWatch(db, watch, deps = {}) {
  const elapsed = log.startTimer();
  // Only a check that worked sets the baseline; after a failed first try the
  // next one must not announce everything that was already listed.
  const first = !watch.baseline_done;
  try {
    const { listings, total, cached } = await findListings(watch, deps);
    const known = await knownListings(db, watch.id);
    const read = await readDescriptions(watch, listings, known, deps);
    // After the first check, a new listing waits until its description has
    // been read, so no notice goes out before the lock words are checked.
    const keep = first ? listings : listings.filter((l) => known.has(l.id) || read.has(l.id));
    const fresh = await saveMatches(db, watch, keep, { notify: !first });
    const matches = listings.filter((l) => !l.skipped && !known.get(l.id)?.skipped).length;
    await recordCheck(db, watch.id, { note: null, worked: true });
    log.info('watch checked', {
      watchId: watch.id, userId: watch.user_id, site: watch.site, listings: total, matches,
      new: fresh.length, descriptionsRead: read.size, skippedByDescription: keep.filter((l) => l.skipped).length,
      waiting: listings.length - keep.length, firstCheck: first, cached, ms: elapsed(),
    });
    return { fresh, total, matches, note: null };
  } catch (err) {
    if (err.code === '23503') {
      log.info('watch deleted while it was being checked', { watchId: watch.id, userId: watch.user_id });
      return { fresh: [], total: 0, matches: 0, note: null };
    }
    const refused = Boolean(err.refused);
    const note = err instanceof AuctionError ? err.message : 'The check failed. censaiOS will try again at the next check.';
    await recordCheck(db, watch.id, { note, pause: refused }).catch(() => {});
    (refused ? log.warn : log.error)(refused ? 'watch paused: site refused' : 'watch check failed', {
      watchId: watch.id, userId: watch.user_id, site: watch.site, status: err.siteStatus, code: err.code, error: err.message, ms: elapsed(),
    });
    return { fresh: [], total: 0, matches: 0, note, paused: refused };
  }
}
