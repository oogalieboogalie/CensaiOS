import express from 'express';
import { google } from 'googleapis';
import { getYouTubeApiKey } from './googleKeys.js';

export const youtubeRouter = express.Router();

youtubeRouter.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: 'No YouTube API key configured. Set YOUTUBE_API_KEY or GOOGLE_CLOUD_API_KEY in .env.',
    });
  }

  try {
    const youtube = google.youtube({ version: 'v3', auth: apiKey });
    const response = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: Math.min(Number(req.query.maxResults || 10) || 10, 25),
    });

    const items = (response.data.items || []).map(item => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet || {};
      return {
        id: videoId,
        title: snippet.title || 'Untitled video',
        channelTitle: snippet.channelTitle || '',
        description: snippet.description || '',
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : '',
        publishedAt: snippet.publishedAt || null,
      };
    }).filter(item => item.id);

    res.json({ items, pageInfo: response.data.pageInfo || null });
  } catch (err) {
    console.error('YouTube API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
