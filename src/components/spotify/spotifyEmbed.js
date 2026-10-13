const EMBEDDABLE_TYPES = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist']);
const SPOTIFY_ID_RE = /^[A-Za-z0-9]+$/;

export const SPOTIFY_DEMO_PRESETS = [
  { name: 'Lofi Beats', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { name: 'Deep Focus', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
  { name: 'Chill Hits', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6' },
];

export function parseSpotifyEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const uri = raw.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)$/i);
  if (uri) return toEmbedUrl(uri[1], uri[2]);

  try {
    const url = new URL(raw);
    if (!isSpotifyHost(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'intl' || segments[0]?.startsWith('intl-')) segments.shift();
    if (segments[0] === 'embed') segments.shift();
    const [type, id] = segments;
    return toEmbedUrl(type, id);
  } catch {
    return null;
  }
}

export function spotifyTitleFromEmbedUrl(embedUrl) {
  try {
    const [, type] = new URL(embedUrl).pathname.split('/').filter(Boolean);
    return type ? `Spotify ${type}` : 'Spotify player';
  } catch {
    return 'Spotify player';
  }
}

function isSpotifyHost(hostname) {
  return hostname === 'open.spotify.com' || hostname === 'play.spotify.com';
}

function toEmbedUrl(type, id) {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedId = String(id || '');
  if (!EMBEDDABLE_TYPES.has(normalizedType) || !SPOTIFY_ID_RE.test(normalizedId)) return null;
  return `https://open.spotify.com/embed/${normalizedType}/${normalizedId}`;
}
