// New Auction Watcher matches, one Inbox line each, until the person opens
// that watch in the Auction Watcher window (which marks them seen).

import { registerInboxSource } from './sources.js';
import { SITE_NAMES } from '../auctionWatcher/errors.js';

let lister = async ({ userId }) => {
  const [{ default: pool }, { freshMatches }] = await Promise.all([import('../db.js'), import('../auctionWatcher/store.js')]);
  return freshMatches(pool, userId);
};
export function setAuctionMatchLister(fn) { lister = fn; }

const dollars = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : 'no price yet');

/** One new match as an Inbox report. */
export function auctionMatchReport(match) {
  const flags = match.redFlags?.length ? ` · red flag: ${match.redFlags.join(', ')}` : '';
  return {
    id: `match-${match.id}`,
    note: true,
    title: `New match: ${match.title}`,
    detail: `${dollars(match.price)} on ${SITE_NAMES[match.site] || match.site} for "${match.query}"${flags}`,
    agent: 'Auction Watcher',
    url: match.url,
    count: 1,
    lastHour: null,
    firstSeen: match.foundAt,
    lastSeen: match.foundAt,
    repo: SITE_NAMES[match.site] || 'Auction Watcher',
    fixable: false,
  };
}

export function registerAuctionWatcherSource() {
  return registerInboxSource('auction-watcher', {
    async list({ userId }) {
      if (!userId) return [];
      return (await lister({ userId })).map(auctionMatchReport);
    },
  });
}
