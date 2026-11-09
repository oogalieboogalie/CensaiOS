import express from 'express';
import { createLogger } from './logger.js';
import { safeErrorCode } from './security/errorCode.js';
import { redditListing } from './redditClient.js';
import {
  DESKTOP_AUTH_NOTE, REDDIT_CATEGORIES, WEB_FALLBACK_NOTE, sourceFromCategory,
} from '../shared/reddit/redditFeed.js';

const log = createLogger('reddit');

export const redditRouter = express.Router();

redditRouter.get('/categories', (_req, res) => {
  res.json({
    categories: REDDIT_CATEGORIES.map((c) => ({ ...c, source: sourceFromCategory(c) })),
    desktopNote: DESKTOP_AUTH_NOTE,
    webNote: WEB_FALLBACK_NOTE,
  });
});

redditRouter.get('/feed', async (req, res) => {
  const subreddit = String(req.query.subreddit || req.query.feed || '').trim();
  const sort = String(req.query.sort || 'hot').trim();
  const feed = String(req.query.feed || '').trim();
  if (!subreddit && !feed) {
    return res.status(400).json({ error: 'Missing subreddit', code: 'REDDIT_BAD_SUBREDDIT', webNote: WEB_FALLBACK_NOTE });
  }

  try {
    const data = await redditListing(subreddit || feed, sort, { limit: req.query.limit, feed: feed || undefined });
    log.info('feed', { kind: data.source.type, count: data.posts.length, worked: true });
    res.json({ ...data, desktopNote: DESKTOP_AUTH_NOTE, webNote: WEB_FALLBACK_NOTE });
  } catch (err) {
    log.info('feed', { worked: false, code: safeErrorCode(err) || err.code || 'REDDIT_REQUEST_FAILED' });
    res.status(err.statusCode || 502).json({
      error: err.message || 'Reddit feed did not load. Try again.',
      code: err.code || 'REDDIT_REQUEST_FAILED',
      webNote: WEB_FALLBACK_NOTE,
    });
  }
});
