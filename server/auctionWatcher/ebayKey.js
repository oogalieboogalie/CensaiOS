// The person's own eBay developer keys, from their key vault.

import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { AuctionError } from './errors.js';
import { parseEbayKey } from './sites/ebay.js';

/** The person's own eBay App ID + Cert ID, or a plain-words error. */
export async function ebayKeyFor(userId, { loadKey = getUserApiKeyConfig } = {}) {
  const config = await loadKey(userId, 'ebay').catch(() => null);
  const key = parseEbayKey(config?.apiKey);
  if (!key) {
    throw new AuctionError('Add your free eBay developer keys (App ID and Cert ID) in the Auction Watcher to watch eBay.', { status: 400, code: 'ebay_key', refused: true });
  }
  return key;
}
