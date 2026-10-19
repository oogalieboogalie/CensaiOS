// Auction Watcher: which listings match, red flags, the guarded fetch (only
// two sites, no redirects, pause on a refusal) and one full check.
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { matchesWatch, redFlags, wordList } from '../server/auctionWatcher/match.js';
import { allowedHost, CACHE_MS, resetSiteFetch, siteFetch, USER_AGENT } from '../server/auctionWatcher/fetcher.js';
import { checkWatch, DESCRIPTIONS_PER_CHECK } from '../server/auctionWatcher/check.js';
import { normalizeWatchInput } from '../server/auctionWatcher/store.js';
import { parseInsights } from '../server/auctionWatcher/insights.js';
import { auctionMatchReport } from '../server/inbox/auctionWatcherSource.js';
import { dollars, timeLeft } from '../src/components/auctionWatcher/format.js';

const sample = (name) => fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/auction-watcher', name), 'utf8');
const reply = (status, text = '') => ({ status, text: async () => text });

beforeEach(() => resetSiteFetch());

describe('matching', () => {
  const t480 = { title: 'Lenovo ThinkPad T480 Laptop 16GB', price: 61 };
  test('price, must mention and must not mention', () => {
    expect(matchesWatch(t480, { maxPrice: 100 })).toBe(true);
    expect(matchesWatch(t480, { maxPrice: 50 })).toBe(false);
    expect(matchesWatch(t480, { mustWords: ['thinkpad', '16gb'] })).toBe(true);
    expect(matchesWatch(t480, { mustWords: 'thinkpad, 32gb' })).toBe(false);
    expect(matchesWatch(t480, { notWords: ['supervisor password'] })).toBe(true);
    expect(matchesWatch(t480, { not_words: ['supervisor password'] }, 'Has a supervisor  password set')).toBe(false);
  });

  test('word lists are trimmed, lower case, unique and capped', () => {
    expect(wordList(' BIOS Locked ,bios locked,\n tamper ')).toEqual(['bios locked', 'tamper']);
    expect(wordList(Array.from({ length: 20 }, (_, i) => `w${i}`))).toHaveLength(10);
  });

  test('red flags catch lock wording', () => {
    expect(redFlags('ThinkPad X1 - Supervisor Password Set, Tamper Detected')).toEqual(['supervisor password', 'tamper detected']);
    expect(redFlags('Yoga 7i', 'BIOS LOCKED for parts')).toEqual(['BIOS locked']);
    expect(redFlags('Lenovo ThinkPad T480 works great')).toEqual([]);
  });

  test('watch input is cleaned and the interval is at least 15 minutes', () => {
    expect(normalizeWatchInput({ query: '  lenovo   thinkpad ', maxPrice: '300', intervalMinutes: 5, notWords: 'bios locked' }))
      .toEqual({ site: 'shopgoodwill', query: 'lenovo thinkpad', maxPrice: 300, mustWords: [], notWords: ['bios locked'], intervalMinutes: 15 });
    expect(() => normalizeWatchInput({ query: '' })).toThrow('Type what to search for');
    expect(() => normalizeWatchInput({ site: 'facebook', query: 'x' })).toThrow('Pick Goodwill or eBay');
  });
});

describe('guarded fetch', () => {
  test('only the two known sites', async () => {
    expect(allowedHost('buyerapi.shopgoodwill.com')).toBe(true);
    expect(allowedHost('api.ebay.com')).toBe(true);
    expect(allowedHost('facebook.com')).toBe(false);
    const fetchImpl = jest.fn();
    await expect(siteFetch('shopgoodwill', 'https://www.facebook.com/marketplace', { fetchImpl, gap: false })).rejects.toMatchObject({ code: 'unknown_site' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('says who it is, never follows redirects, and keeps a reply for 5 minutes', async () => {
    const fetchImpl = jest.fn(async () => reply(200, '{"items":[]}'));
    const url = 'https://buyerapi.shopgoodwill.com/api/Search/ItemListing';
    await siteFetch('shopgoodwill', url, { method: 'POST', body: '{"a":1}', fetchImpl, gap: false });
    const second = await siteFetch('shopgoodwill', url, { method: 'POST', body: '{"a":1}', fetchImpl, gap: false });
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The shortest check interval (15 min) is always longer than the copy is kept.
    expect(CACHE_MS).toBeLessThan(15 * 60 * 1000);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['User-Agent']).toBe(USER_AGENT);
    expect(init.redirect).toBe('manual');
  });

  test('a refusal or a redirect is marked so the watch pauses', async () => {
    for (const status of [403, 429, 302]) {
      resetSiteFetch();
      await expect(siteFetch('shopgoodwill', 'https://shopgoodwill.com/x', { fetchImpl: async () => reply(status), gap: false }))
        .rejects.toMatchObject({ refused: true, siteStatus: status });
    }
    await expect(siteFetch('shopgoodwill', 'https://shopgoodwill.com/y', { fetchImpl: async () => reply(500), gap: false }))
      .rejects.toMatchObject({ refused: false, code: 'site_error' });
  });
});

function fakeDb(existing = []) {
  const saved = [];
  const calls = [];
  return {
    saved,
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT listing_id')) return { rows: existing.map(([id, read, skipped = false]) => ({ listing_id: id, read, skipped })) };
      if (sql.includes('INSERT INTO auction_matches')) {
        const isNew = !saved.some((s) => s[2] === params[2]) && !existing.some(([id]) => id === params[2]);
        if (isNew) saved.push(params);
        return { rows: [{ id: saved.length, watch_id: params[0], listing_id: params[2], title: params[3], price: params[4], red_flags: params[11], notify: params[12] && !params[13], skipped: params[13], inserted: isNew }] };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('one check', () => {
  const watch = { id: 7, user_id: 3, site: 'shopgoodwill', query: 'lenovo thinkpad', max_price: '100', must_words: ['thinkpad'], not_words: [], last_checked_at: null };

  test('keeps matches under the price, flags locks, and the first check sends no notices', async () => {
    const db = fakeDb();
    const fetch = jest.fn(async () => ({ text: sample('goodwill-search.json') }));
    const result = await checkWatch(db, watch, { fetch });
    expect(result.total).toBe(3);
    expect(result.matches).toBe(2);
    expect(db.saved.map((p) => [p[2], p[11], p[12]])).toEqual([
      ['900000101', [], false],
      ['900000102', ['supervisor password', 'tamper detected'], false],
    ]);
    // A first try that failed (checked, but no baseline yet) still sends no notices.
    const retry = fakeDb();
    await checkWatch(retry, { ...watch, last_checked_at: new Date().toISOString(), baseline_done: false }, { fetch });
    expect(retry.saved.every((p) => p[12] === false)).toBe(true);
    // After a check that worked, what turns up next is announced.
    const later = fakeDb();
    const again = await checkWatch(later, { ...watch, baseline_done: true }, { fetch });
    expect(again.fresh).toHaveLength(2);
    expect(later.saved.every((p) => p[12] === true)).toBe(true);
    expect(later.calls.find((c) => c.sql.includes('UPDATE auction_watches')).params[3]).toBe(true);
  });

  // The case that started this: the lock is only in the seller's description.
  test('reads each new listing\'s description once, so lock words there flag or skip it', async () => {
    const detail = sample('goodwill-item-detail.json');
    const fetch = jest.fn(async (site, url) => ({ text: url.includes('/ItemDetail/') ? (url.endsWith('/900000101') ? detail : '{}') : sample('goodwill-search.json') }));
    const db = fakeDb();
    const result = await checkWatch(db, { ...watch, baseline_done: true }, { fetch });
    expect(fetch.mock.calls.filter(([, url]) => url.includes('/ItemDetail/')).map(([, url]) => url.split('/').pop())).toEqual(['900000101', '900000102']);
    expect(db.saved.find((p) => p[2] === '900000101')[11]).toEqual(['supervisor password', 'tamper detected']);
    expect(result.fresh.map((m) => m.redFlags)).toContainEqual(['supervisor password', 'tamper detected']);
    // With "Skip locked laptops", the same listing is kept as skipped and never announced.
    const skipping = fakeDb();
    const skipped = await checkWatch(skipping, { ...watch, baseline_done: true, not_words: ['supervisor password', 'bios locked', 'tamper'] }, { fetch });
    expect(skipping.saved.map((p) => [p[2], p[13], p[14]])).toEqual([['900000101', true, true]]);
    expect(skipped.fresh).toEqual([]);
    expect(skipped.matches).toBe(0);
    // Listings already read are never fetched again.
    fetch.mockClear();
    const again = await checkWatch(fakeDb([['900000101', true, true], ['900000102', true]]), { ...watch, baseline_done: true }, { fetch });
    expect(fetch.mock.calls.some(([, url]) => url.includes('/ItemDetail/'))).toBe(false);
    expect(again.matches).toBe(1);
  });

  test('at most a few descriptions per check; later new listings wait their turn', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ itemId: 910000000 + i, title: `Lenovo ThinkPad T${470 + i}`, currentPrice: 40, endTime: '2026-10-20T19:30:00' }));
    const fetch = jest.fn(async (site, url) => ({ text: url.includes('/ItemDetail/') ? '{}' : JSON.stringify({ searchResults: { items } }) }));
    const db = fakeDb();
    const result = await checkWatch(db, { ...watch, baseline_done: true }, { fetch });
    expect(fetch.mock.calls.filter(([, url]) => url.includes('/ItemDetail/'))).toHaveLength(DESCRIPTIONS_PER_CHECK);
    expect(result.fresh).toHaveLength(DESCRIPTIONS_PER_CHECK);
    // The first check saves everything (no notices) and reads the rest later.
    const baseline = fakeDb();
    await checkWatch(baseline, watch, { fetch });
    expect(baseline.saved).toHaveLength(8);
    expect(baseline.saved.filter((p) => p[14])).toHaveLength(DESCRIPTIONS_PER_CHECK);
  });

  test('a site that refuses a description pauses the watch', async () => {
    const fetch = async (site, url) => {
      if (url.includes('/ItemDetail/')) throw Object.assign(new Error('Goodwill said no (429).'), { refused: true, siteStatus: 429 });
      return { text: sample('goodwill-search.json') };
    };
    const db = fakeDb();
    const result = await checkWatch(db, { ...watch, baseline_done: true }, { fetch });
    expect(result.paused).toBe(true);
    expect(db.saved).toEqual([]);
  });

  test('a refusal pauses the watch with a plain note instead of throwing', async () => {
    const db = fakeDb();
    const fetch = async () => { throw Object.assign(new Error('Goodwill refused the check (403).'), { refused: true, siteStatus: 403 }); };
    const result = await checkWatch(db, watch, { fetch });
    expect(result.paused).toBe(true);
    const update = db.calls.find((c) => c.sql.includes('UPDATE auction_watches'));
    expect(update.params).toEqual([7, 'The check failed. censaiOS will try again at the next check.', true, false]);
  });

  test('eBay without a saved key says how to add one', async () => {
    const result = await checkWatch(fakeDb(), { ...watch, site: 'ebay' }, { loadKey: async () => null });
    expect(result.note).toMatch(/free eBay developer keys/);
    expect(result.paused).toBe(true);
  });
});

describe('pieces the window and Inbox show', () => {
  test('pros and cons come back clean even from a chatty model', () => {
    expect(parseInsights('Sure! {"pros":["Cheap"],"cons":["May stay locked"],"verdict":"Skip it."} hope that helps'))
      .toEqual({ pros: ['Cheap'], cons: ['May stay locked'], verdict: 'Skip it.' });
    expect(parseInsights('no json here').verdict).toBe('no json here');
  });

  test('an Inbox line per new match', () => {
    const report = auctionMatchReport({ id: 4, title: 'ThinkPad T480', price: 61, site: 'shopgoodwill', query: 'lenovo thinkpad', url: 'https://shopgoodwill.com/item/1', redFlags: [], foundAt: '2026-10-18T21:00:00.000Z' });
    expect(report).toMatchObject({ id: 'match-4', note: true, title: 'New match: ThinkPad T480', detail: '$61.00 on Goodwill for "lenovo thinkpad"', url: 'https://shopgoodwill.com/item/1' });
  });

  test('time left and prices in plain words', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(timeLeft('2026-10-20T15:30:00Z', now)).toBe('2d 3h left');
    expect(timeLeft('2026-10-18T12:20:00Z', now)).toBe('20m left');
    expect(timeLeft('2026-10-18T11:00:00Z', now)).toBe('ended');
    expect(dollars(1234.5)).toBe('$1,234.50');
  });
});
