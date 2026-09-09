import { getSecret } from './secrets.js';

// Non-Gemini Google Cloud APIs, such as YouTube Data API v3, need their own
// API key. Never fall back to GEMINI_API_KEY for these.
export function getGeminiApiKey(fallbackKey = '') {
  return getSecret('GEMINI_API_KEY') || getSecret('GOOGLE_API_KEY') || fallbackKey;
}

export function getYouTubeApiKey() {
  return getSecret('YOUTUBE_API_KEY') || getSecret('GOOGLE_CLOUD_API_KEY') || '';
}
