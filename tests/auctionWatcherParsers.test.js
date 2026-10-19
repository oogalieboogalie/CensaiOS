// Auction Watcher: reading Goodwill and eBay replies into listings. The
// samples under tests/fixtures/auction-watcher/ are fake listings.
import fs from 'node:fs';
import path from 'node:path';
import { goodwillSearchBody, pacificToIso, parseGoodwill } from '../server/auctionWatcher/sites/goodwill.js';
import { ebayListing, parseEbayKey, parseEbaySearch } from '../server/auctionWatcher/sites/ebay.js';

const sample = (name) => fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/auction-watcher', name), 'utf8');

describe('Goodwill parser', () => {
  test('reads the search service JSON, skipping bad and duplicate rows', () => {
    const listings = parseGoodwill(sample('goodwill-search.json'));
    expect(listings.map((l) => l.id)).toEqual(['900000101', '900000102', '900000103']);
    expect(listings[0]).toEqual({
      id: '900000101',
      title: 'Lenovo ThinkPad T480 14in Laptop i5 8GB - Powers On',
      price: 61,
      currency: 'USD',
      endsAt: '2026-10-21T02:30:00.000Z',
      imageUrl: 'https://shopgoodwillimages.azureedge.net/production/fake/t480.jpg',
      url: 'https://shopgoodwill.com/item/900000101',
      bids: 7,
      buyNow: null,
    });
  });

  test('a picture path without an address gets the Goodwill image host; none stays null', () => {
    const [, x1, idea] = parseGoodwill(sample('goodwill-search.json'));
    expect(x1.imageUrl).toBe('https://shopgoodwillimages.azureedge.net/production/fake/x1.jpg');
    expect(idea.imageUrl).toBeNull();
  });

  test('reads listings from a search page saved page state (quotes written as &q;)', () => {
    const listings = parseGoodwill(sample('goodwill-page.html'));
    expect(listings.map((l) => l.title)).toEqual([
      'Lenovo ThinkPad T480 14in Laptop i5 8GB - Powers On',
      'Lenovo ThinkPad X1 Carbon Laptop - Supervisor Password Set, Tamper Detected',
    ]);
  });

  test('anything else gives no listings instead of an error', () => {
    expect(parseGoodwill('<html><body>Access denied</body></html>')).toEqual([]);
    expect(parseGoodwill('{not json')).toEqual([]);
    expect(parseGoodwill('')).toEqual([]);
    expect(parseGoodwill({ searchResults: { items: [{ itemId: 5 }] } })).toEqual([]);
  });

  test('picture addresses that are not https are dropped', () => {
    const [item] = parseGoodwill({ items: [{ itemId: 1, title: 'x', imageURL: 'http://example.com/a.jpg' }] });
    expect(item.imageUrl).toBeNull();
  });

  test('Pacific end times become exact times in summer and winter', () => {
    expect(pacificToIso('2026-07-01T12:00:00')).toBe('2026-07-01T19:00:00.000Z');
    expect(pacificToIso('2026-12-01T12:00:00')).toBe('2026-12-01T20:00:00.000Z');
    expect(pacificToIso('2026-12-01T12:00:00Z')).toBe('2026-12-01T12:00:00.000Z');
    expect(pacificToIso('soon')).toBeNull();
  });

  test('the search sends the words and the max price', () => {
    const body = goodwillSearchBody({ query: 'lenovo thinkpad', maxPrice: 299.5 });
    expect(body).toMatchObject({ searchText: 'lenovo thinkpad', highPrice: '300', searchClosedAuctions: 'false' });
    expect(goodwillSearchBody({ query: 'x', closed: true }).searchClosedAuctions).toBe('true');
  });
});

describe('eBay parser', () => {
  test('reads Browse API results, current bid first, and keeps only eBay links', () => {
    const [t14, yoga, ...rest] = parseEbaySearch(sample('ebay-search.json'));
    expect(rest).toEqual([]);
    expect(t14).toMatchObject({ id: 'v1|110000000001|0', price: 142.5, bids: 11, buyNow: null, url: 'https://www.ebay.com/itm/110000000001' });
    expect(yoga).toMatchObject({ price: 79.99, bids: null, buyNow: 79.99, imageUrl: 'https://i.ebayimg.com/images/g/fake2/s-l225.jpg' });
    expect(yoga.url).toBe('https://www.ebay.com/itm/110000000002');
  });

  test('bad JSON gives nothing', () => {
    expect(parseEbaySearch('nope')).toEqual([]);
    expect(ebayListing({})).toBeNull();
  });

  test('the saved key is "AppID:CertID" or the two on separate lines', () => {
    expect(parseEbayKey('Alex-App-PRD-123:PRD-secret-456')).toEqual({ clientId: 'Alex-App-PRD-123', clientSecret: 'PRD-secret-456' });
    expect(parseEbayKey('Alex-App\nPRD-secret')).toEqual({ clientId: 'Alex-App', clientSecret: 'PRD-secret' });
    expect(parseEbayKey('only-one-part')).toBeNull();
    expect(parseEbayKey(':secret')).toBeNull();
    expect(parseEbayKey(undefined)).toBeNull();
  });
});
