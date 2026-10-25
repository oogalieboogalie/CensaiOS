import express from 'express';
import { resolveYouTubeKey } from './googleKeys.js';
import { youtubeChannel, youtubeSearch } from './youtubeClient.js';
import { createLogger } from './logger.js';

// One line per search: which window, saved key or setup file, worked or why
// not. Never the search words and never the key.
const log = createLogger('youtube');

const WINDOW_NAMES = Object.freeze({
  music: 'Music Player',
  stream: 'Stream Viewer',
  shorts: 'Shorts',
});

const NEEDS_KEY = Object.freeze({
  error: 'YouTube search needs a key. Paste one in Settings, under AI keys.',
  code: 'YOUTUBE_KEY_REQUIRED',
});

export const youtubeRouter = express.Router();

function windowOf(req) {
  return WINDOW_NAMES[String(req.query.from || '').trim()] || 'unknown';
}

youtubeRouter.get('/key', async (req, res) => {
  const { source } = await resolveYouTubeKey(req.session?.userId);
  res.json({ configured: Boolean(source), source });
});

youtubeRouter.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const window = windowOf(req);
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  const { apiKey, source } = await resolveYouTubeKey(req.session?.userId);
  if (!apiKey) {
    log.info('search', { window, source: 'none', worked: false, why: 'needs a key' });
    return res.status(424).json(NEEDS_KEY);
  }

  try {
    const data = await youtubeSearch(apiKey, {
      query,
      shorts: req.query.shorts === '1',
      maxResults: req.query.maxResults,
    });
    log.info('search', { window, source, worked: true });
    res.json(data);
  } catch (err) {
    log.info('search', { window, source, worked: false, why: err.why || 'failed' });
    res.status(err.statusCode || 502).json({
      error: err.message || 'YouTube search did not work. Try again.',
      code: err.code || 'YOUTUBE_REQUEST_FAILED',
    });
  }
});

// Resolves a channel @handle to its id, so the Shorts window can play that
// channel's Shorts shelf. Pasted /channel/UC… links never need this.
youtubeRouter.get('/channel', async (req, res) => {
  const handle = String(req.query.handle || '').trim();
  if (!/^@[A-Za-z0-9._-]{3,30}$/.test(handle)) {
    return res.status(400).json({ error: 'Expected a channel handle like @nasa' });
  }

  const { apiKey } = await resolveYouTubeKey(req.session?.userId);
  if (!apiKey) return res.status(424).json(NEEDS_KEY);

  try {
    const channel = await youtubeChannel(apiKey, handle);
    if (!channel) return res.status(404).json({ error: `No channel found for ${handle}` });
    res.json(channel);
  } catch (err) {
    res.status(err.statusCode || 502).json({
      error: err.message || 'YouTube search did not work. Try again.',
      code: err.code || 'YOUTUBE_REQUEST_FAILED',
    });
  }
});
