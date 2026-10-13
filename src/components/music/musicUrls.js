// Link parsing and embed messaging for the Music window's streamed sources
// (YouTube, YouTube Music, Spotify, SoundCloud).
import { parseSpotifyEmbedUrl } from '../spotify/spotifyEmbed.js';

function withYouTubeApi(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined') u.searchParams.set('origin', window.location.origin);
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&enablejsapi=1` : `${url}?enablejsapi=1`;
  }
}

export function parseMusicUrl(url) {
  if (!url) return '';
  // Spotify
  if (url.startsWith('spotify:') || url.includes('spotify.com')) {
    if (url.includes('/embed/')) return url;
    return parseSpotifyEmbedUrl(url) || url.replace('spotify.com/', 'spotify.com/embed/');
  }
  // SoundCloud
  if (url.includes('soundcloud.com')) {
    if (url.includes('w.soundcloud.com')) return url;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
  }
  // YouTube (including music.youtube.com watch links)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('/embed/')) return withYouTubeApi(url);
    let videoId = '';
    if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0];
    if (videoId) return withYouTubeApi(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
  }
  return url;
}

export function isYouTubeEmbed(url) {
  return /youtube\.com\/embed\//.test(url || '');
}

export function titleFromUrl(url) {
  if (!url) return 'Current stream';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Current stream';
  }
}

function parseMessage(data) {
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data && typeof data === 'object' ? data : null;
}

/**
 * Translate a postMessage from a YouTube, SoundCloud or Spotify embed into
 * `{ playing, position, duration }` (seconds; fields only when reported).
 */
export function readPlayerMessage(raw) {
  const data = parseMessage(raw);
  if (!data) return null;
  // YouTube iframe API: infoDelivery / initialDelivery.
  if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
    const out = {};
    const { currentTime, duration, playerState } = data.info;
    if (Number.isFinite(currentTime)) out.position = currentTime;
    if (Number.isFinite(duration) && duration > 0) out.duration = duration;
    if (Number.isFinite(playerState)) out.playing = playerState === 1 || playerState === 3;
    if (playerState === 0) out.ended = true;
    return out;
  }
  // SoundCloud widget API.
  if (typeof data.method === 'string') {
    const v = data.value;
    if (data.method === 'playProgress' && v) return { playing: true, position: (v.currentPosition || 0) / 1000 };
    if (data.method === 'play') return { playing: true };
    if (data.method === 'finish') return { playing: false, ended: true };
    if (data.method === 'pause') return { playing: false };
    if (data.method === 'getDuration' && Number.isFinite(v)) return { duration: v / 1000 };
    return null;
  }
  // Spotify embed.
  if (data.type === 'playback_update' && data.payload) {
    const p = data.payload;
    const out = {};
    if (typeof p.isPaused === 'boolean') out.playing = !p.isPaused;
    if (Number.isFinite(p.position)) out.position = p.position / 1000;
    if (Number.isFinite(p.duration) && p.duration > 0) out.duration = p.duration / 1000;
    return out;
  }
  return null;
}

export function embedKind(src) {
  if (isYouTubeEmbed(src)) return 'youtube';
  if (/w\.soundcloud\.com/.test(src || '')) return 'soundcloud';
  if (/spotify\.com\/embed\//.test(src || '')) return 'spotify';
  return 'other';
}

/**
 * The postMessage that sets this viewer's volume on an embed, or null when
 * the source has no volume API (Spotify keeps its own slider).
 */
export function volumeMessages(kind, volume, muted) {
  if (kind === 'youtube') {
    return [
      { event: 'command', func: 'setVolume', args: [volume] },
      { event: 'command', func: muted ? 'mute' : 'unMute', args: [] },
    ];
  }
  if (kind === 'soundcloud') return [{ method: 'setVolume', value: muted ? 0 : volume }];
  return null;
}
