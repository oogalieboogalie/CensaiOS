// Auction Watcher routes: signed in only, each person's own watches, and
// "Check now" never asks a site more often than every 15 minutes.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAuctionWatcherRouter } from '../server/routes/auctionWatcher.js';

const row = (over = {}) => ({
  id: 5, user_id: 7, site: 'shopgoodwill', query: 'lenovo thinkpad', max_price: '300', must_words: [], not_words: [],
  interval_minutes: 30, status: 'active', status_note: null, last_checked_at: null, next_check_at: null, ...over,
});

function app({ session = { userId: 7 }, rows = [row()], check = jest.fn(async () => ({ fresh: [], matches: 2, note: null })) } = {}) {
  const db = {
    query: jest.fn(async (sql, params) => {
      if (sql.startsWith('SELECT * FROM auction_watches') || sql.includes('FROM auction_watches w WHERE w.user_id = $1 AND w.id = $2')) {
        return { rows: rows.filter((r) => r.user_id === params[0] && r.id === params[1]) };
      }
      if (sql.includes('FROM auction_watches w WHERE w.user_id = $1')) return { rows: rows.filter((r) => r.user_id === params[0]) };
      return { rows: [], rowCount: 0 };
    }),
  };
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = session; next(); });
  instance.use('/api/auction-watcher', createAuctionWatcherRouter({ db, check, loadKey: async () => null, now: () => Date.parse('2026-10-18T21:00:00Z') }));
  return { instance, db, check };
}

test('signed out gets a 401', async () => {
  const res = await request(app({ session: {} }).instance).get('/api/auction-watcher/watches');
  expect(res.status).toBe(401);
});

test('lists only my watches and says no eBay key is saved', async () => {
  const { instance } = app({ rows: [row(), row({ id: 6, user_id: 8, query: 'someone else' })] });
  const res = await request(instance).get('/api/auction-watcher/watches');
  expect(res.status).toBe(200);
  expect(res.body.ebayKey).toBe(false);
  expect(res.body.watches.map((w) => w.query)).toEqual(['lenovo thinkpad']);
});

test('check now within 15 minutes of the last check does not ask the site', async () => {
  const { instance, check } = app({ rows: [row({ last_checked_at: '2026-10-18T20:55:00Z' })] });
  const res = await request(instance).post('/api/auction-watcher/watches/5/check');
  expect(res.status).toBe(200);
  expect(res.body.check.skipped).toBe(true);
  expect(res.body.check.note).toMatch(/next check can run in 10 min/);
  expect(check).not.toHaveBeenCalled();
});

test('check now after 15 minutes runs the check', async () => {
  const { instance, check } = app({ rows: [row({ last_checked_at: '2026-10-18T20:30:00Z' })] });
  const res = await request(instance).post('/api/auction-watcher/watches/5/check');
  expect(res.body.check).toEqual({ note: null, matches: 2, fresh: 0 });
  expect(check).toHaveBeenCalledTimes(1);
});

test("someone else's watch is a 404", async () => {
  const { instance } = app({ rows: [row({ user_id: 8 })] });
  const res = await request(instance).post('/api/auction-watcher/watches/5/check');
  expect(res.status).toBe(404);
});
