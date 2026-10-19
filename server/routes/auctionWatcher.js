import express from 'express';
import { createLogger } from '../logger.js';
import { checkWatch } from '../auctionWatcher/check.js';
import { lastSold, matchInsights } from '../auctionWatcher/insights.js';
import {
  createWatch, deleteWatch, freshMatches, getMatch, getWatch, listMatches, listWatches, markSeen,
  matchView, MIN_INTERVAL, normalizeWatchInput, saveMatchExtra, updateWatch,
} from '../auctionWatcher/store.js';
import { parseEbayKey } from '../auctionWatcher/sites/ebay.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';

const log = createLogger('auction-watcher');

// The person's own model key (or the governed free tier) writes the pros and cons.
async function defaultCompleter(req) {
  const [{ resolveAgentRouteScope }, { callModel, createModelAccessContext, workspaceUsageSink }] = await Promise.all([
    import('./agents/scope.js'), import('../aiGateway/index.js'),
  ]);
  const scope = await resolveAgentRouteScope(req);
  const source = 'auction-watcher';
  const accessContext = createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source });
  return async (messages, { maxTokens = 500, temperature = 0.2 } = {}) => {
    const data = await callModel({
      accessContext,
      body: { messages, max_tokens: maxTokens, temperature },
      timeoutMs: 60000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}

/**
 * The Auction Watcher window (src/components/AuctionWatcherWindow.jsx).
 *
 * GET    /api/auction-watcher/watches               my watches + whether an eBay key is saved
 * POST   /api/auction-watcher/watches               { site, query, maxPrice, mustWords, notWords, intervalMinutes }
 * PATCH  /api/auction-watcher/watches/:id           { status: 'paused'|'active', intervalMinutes }
 * DELETE /api/auction-watcher/watches/:id
 * POST   /api/auction-watcher/watches/:id/check     check now (at most every 15 minutes)
 * GET    /api/auction-watcher/watches/:id/matches
 * POST   /api/auction-watcher/watches/:id/seen      the person looked; clears its notices
 * POST   /api/auction-watcher/matches/:id/insights  AI pros and cons (own model key; reads the description, looks at the photos)
 * POST   /api/auction-watcher/matches/:id/sold      last sold price for the watch's words
 * GET    /api/auction-watcher/fresh?since=ISO       new matches for the board's toast
 */
export function createAuctionWatcherRouter({
  db = null, check = checkWatch, completer = defaultCompleter, loadKey = getUserApiKeyConfig, now = Date.now,
} = {}) {
  const router = express.Router();
  const pool = async () => db || (await import('../db.js')).default;
  const id = (value) => (/^\d{1,9}$/.test(String(value)) ? Number(value) : null);

  router.use((req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    return next();
  });

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res, await pool(), req.session.userId);
    } catch (err) {
      if (!err.statusCode) log.error('request failed', { path: req.path, error: err.message });
      res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'The Auction Watcher hit a problem. It is in the app log.', code: err.code });
    }
  };

  const rawWatch = async (q, userId, watchId) => (await q.query('SELECT * FROM auction_watches WHERE user_id = $1 AND id = $2', [userId, watchId])).rows[0];

  router.get('/watches', handle(async (req, res, q, userId) => {
    const ebay = parseEbayKey((await loadKey(userId, 'ebay').catch(() => null))?.apiKey);
    res.json({ watches: await listWatches(q, userId), ebayKey: Boolean(ebay), minInterval: MIN_INTERVAL });
  }));

  router.post('/watches', handle(async (req, res, q, userId) => {
    const watch = await createWatch(q, userId, normalizeWatchInput(req.body));
    log.info('watch added', { watchId: watch.id, userId, site: watch.site, intervalMinutes: watch.intervalMinutes });
    const result = await check(q, await rawWatch(q, userId, watch.id));
    res.status(201).json({ watch: await getWatch(q, userId, watch.id), check: { note: result.note, matches: result.matches } });
  }));

  router.patch('/watches/:id', handle(async (req, res, q, userId) => {
    const watch = await updateWatch(q, userId, id(req.params.id), req.body || {});
    if (!watch) return res.status(404).json({ error: 'That watch is gone.' });
    log.info('watch changed', { watchId: watch.id, userId, status: watch.status, intervalMinutes: watch.intervalMinutes });
    return res.json({ watch });
  }));

  router.delete('/watches/:id', handle(async (req, res, q, userId) => {
    const gone = await deleteWatch(q, userId, id(req.params.id));
    if (gone) log.info('watch deleted', { watchId: id(req.params.id), userId });
    res.json({ ok: gone });
  }));

  router.post('/watches/:id/check', handle(async (req, res, q, userId) => {
    const row = await rawWatch(q, userId, id(req.params.id));
    if (!row) return res.status(404).json({ error: 'That watch is gone.' });
    const ago = row.last_checked_at ? now() - new Date(row.last_checked_at).getTime() : Infinity;
    if (ago < MIN_INTERVAL * 60000) {
      const wait = Math.ceil((MIN_INTERVAL * 60000 - ago) / 60000);
      return res.json({ watch: await getWatch(q, userId, row.id), check: { skipped: true, note: `Checked ${Math.floor(ago / 60000)} min ago. Sites get asked at most every ${MIN_INTERVAL} minutes, so the next check can run in ${wait} min.` } });
    }
    const result = await check(q, row);
    return res.json({ watch: await getWatch(q, userId, row.id), check: { note: result.note, matches: result.matches, fresh: result.fresh.length } });
  }));

  router.get('/watches/:id/matches', handle(async (req, res, q, userId) => {
    res.json({ matches: await listMatches(q, userId, id(req.params.id)) });
  }));

  router.post('/watches/:id/seen', handle(async (req, res, q, userId) => {
    res.json({ cleared: await markSeen(q, userId, id(req.params.id)) });
  }));

  router.post('/matches/:id/insights', handle(async (req, res, q, userId) => {
    const match = await getMatch(q, userId, id(req.params.id));
    if (!match) return res.status(404).json({ error: 'That listing is gone.' });
    const insights = await matchInsights(match, { complete: await completer(req), loadKey }).catch((err) => {
      log.warn('insights failed', { matchId: match.id, userId, error: err.message });
      throw Object.assign(new Error(`The AI could not write pros and cons (${err.message}). Check your chat model key in Settings.`), { statusCode: 502 });
    });
    await saveMatchExtra(q, userId, match.id, 'insights', insights);
    log.info('insights written', { matchId: match.id, userId, redFlags: insights.redFlags.length, readDescription: insights.readDescription, photosChecked: insights.photosChecked, photoLock: Boolean(insights.photoLock) });
    return res.json({ match: matchView({ ...match, insights }) });
  }));

  router.post('/matches/:id/sold', handle(async (req, res, q, userId) => {
    const match = await getMatch(q, userId, id(req.params.id));
    if (!match) return res.status(404).json({ error: 'That listing is gone.' });
    const sold = await lastSold(match, { loadKey }).catch((err) => ({ query: match.query, none: err.message }));
    const saved = { ...sold, at: new Date(now()).toISOString() };
    await saveMatchExtra(q, userId, match.id, 'last_sold', saved);
    log.info('last sold looked up', { matchId: match.id, userId, site: match.site, found: !sold.none });
    return res.json({ match: matchView({ ...match, last_sold: saved }) });
  }));

  router.get('/fresh', handle(async (req, res, q, userId) => {
    const since = req.query.since && !Number.isNaN(Date.parse(req.query.since)) ? new Date(req.query.since).toISOString() : null;
    res.json({ matches: await freshMatches(q, userId, { since }), now: new Date(now()).toISOString() });
  }));

  return router;
}

export const auctionWatcherRouter = createAuctionWatcherRouter();
