/**
 * Normalizes YouTube URLs (watch, share links, playlists, shorts) into standard YouTube embed URLs.
 * @param {string} url
 * @returns {string|null}
 */
export function parseYoutubeEmbedUrl(url) {
  if (!url) return null;
  const cleanUrl = url.trim();

  // If already an embed URL, return it
  if (cleanUrl.includes('youtube.com/embed/')) {
    return cleanUrl;
  }

  try {
    const parsed = new URL(cleanUrl);
    
    // youtu.be
    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.substring(1);
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    
    // youtube.com
    if (parsed.hostname.endsWith('youtube.com') || parsed.hostname === 'youtube.com') {
      if (parsed.pathname === '/playlist') {
        const listId = parsed.searchParams.get('list');
        if (listId) return `https://www.youtube.com/embed/videoseries?list=${listId}`;
      }
      if (parsed.pathname === '/watch') {
        const videoId = parsed.searchParams.get('v');
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const videoId = parsed.pathname.split('/')[2];
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }
    }
  } catch (e) {
    // Ignore URL constructor error
  }

  // Regex fallbacks
  const watchRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\s?]+)/;
  const match = cleanUrl.match(watchRegex);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }

  const playlistRegex = /youtube\.com\/playlist\?list=([^&\s?]+)/;
  const plMatch = cleanUrl.match(playlistRegex);
  if (plMatch && plMatch[1]) {
    return `https://www.youtube.com/embed/videoseries?list=${plMatch[1]}`;
  }

  return null;
}

/**
 * Extracts a friendly title/label from a YouTube embed URL.
 * @param {string} embedUrl
 * @returns {string}
 */
export function youtubeTitleFromEmbedUrl(embedUrl) {
  if (!embedUrl) return 'YouTube';
  if (embedUrl.includes('videoseries')) {
    return 'Playlist';
  }
  const match = embedUrl.match(/\/embed\/([^?\s]+)/);
  if (match && match[1]) {
    return `Video (${match[1]})`;
  }
  return 'YouTube Video';
}

export const YOUTUBE_PRESETS = [
  { name: 'Lo-Fi Chill Ambient', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  { name: 'Developer Productivity Music', url: 'https://www.youtube.com/watch?v=tNkZs5W5WfM' },
  { name: 'Synthwave Radio', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' }
];
