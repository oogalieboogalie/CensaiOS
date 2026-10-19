// Errors the Auction Watcher shows people as they are, in plain words.
//
// `refused` means the site said no (blocked, too many requests, down for
// maintenance): the watch pauses itself instead of asking again and again.

export class AuctionError extends Error {
  constructor(message, { status = 502, code = 'auction_error', refused = false } = {}) {
    super(message);
    this.statusCode = status;
    this.code = code;
    this.refused = refused;
  }
}

export const SITE_NAMES = Object.freeze({ shopgoodwill: 'Goodwill', ebay: 'eBay' });

/** A site's answer that means "stop asking for now". */
export function refusalFor(site, status) {
  const name = SITE_NAMES[site] || site;
  if (status === 429) {
    return new AuctionError(`${name} asked censaiOS to slow down (429). This watch is paused; press Resume later.`, { status: 429, code: 'site_refused', refused: true });
  }
  if (status === 401 || status === 403) {
    return new AuctionError(`${name} refused the check (${status}). This watch is paused; press Resume to try again.`, { status: 502, code: 'site_refused', refused: true });
  }
  if (status >= 300 && status < 400) {
    return new AuctionError(`${name} sent censaiOS somewhere else (${status}) instead of listings. This watch is paused.`, { status: 502, code: 'site_refused', refused: true });
  }
  return new AuctionError(`${name} had a problem on its side (${status}). censaiOS will try again at the next check.`, { status: 502, code: 'site_error' });
}
