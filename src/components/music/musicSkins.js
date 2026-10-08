// Device skins for the retro MP3-player Music window. Each source gets the
// plastic, screen and wheel colors of a branded player: YouTube red, YouTube
// Music black-and-red, Spotify black-and-green, SoundCloud orange, and a
// brushed-silver "generic" player for anything else.

export const MUSIC_SOURCES = ['youtube', 'ytmusic', 'spotify', 'soundcloud', 'generic'];

export function detectMusicSource(url) {
  const raw = String(url || '').toLowerCase();
  if (!raw) return 'generic';
  if (raw.includes('music.youtube.com')) return 'ytmusic';
  if (raw.includes('youtube.com') || raw.includes('youtu.be') || raw.includes('youtube-nocookie.com')) return 'youtube';
  if (raw.startsWith('spotify:') || raw.includes('spotify.com')) return 'spotify';
  if (raw.includes('soundcloud.com')) return 'soundcloud';
  return 'generic';
}

export const MUSIC_SKINS = {
  youtube: {
    brand: 'YouTube',
    model: 'TUBE·PLAYER',
    body: 'linear-gradient(160deg, #ff4b3e 0%, #e62117 42%, #a50e07 100%)',
    bodyEdge: '#7a0a05',
    bodyInk: '#fff',
    screenBg: 'radial-gradient(120% 90% at 50% 0%, #2a0807 0%, #120302 70%)',
    lcdInk: '#ffd9d4',
    lcdDim: 'rgba(255, 190, 180, 0.45)',
    lcdGlow: 'rgba(255, 80, 60, 0.75)',
    vis: ['#ff2a1a', '#ff8a3d', '#ffe66b'],
    peak: '#ffffff',
    wheel: 'radial-gradient(circle at 35% 30%, #fff 0%, #f1f1f1 55%, #cfcfcf 100%)',
    wheelInk: '#c4120a',
    hub: 'radial-gradient(circle at 40% 35%, #ff5a4c 0%, #e62117 60%, #9c0d06 100%)',
    hubInk: '#fff',
  },
  ytmusic: {
    brand: 'YouTube Music',
    model: 'YTM·POD',
    body: 'linear-gradient(160deg, #3a3a3a 0%, #1c1c1c 45%, #050505 100%)',
    bodyEdge: '#000',
    bodyInk: '#fff',
    screenBg: 'radial-gradient(120% 90% at 50% 0%, #1d0606 0%, #070101 72%)',
    lcdInk: '#ffe1de',
    lcdDim: 'rgba(255, 200, 195, 0.42)',
    lcdGlow: 'rgba(255, 0, 0, 0.7)',
    vis: ['#ff0000', '#ff4e45', '#ffb3ad'],
    peak: '#ffffff',
    wheel: 'radial-gradient(circle at 35% 30%, #4a4a4a 0%, #262626 60%, #121212 100%)',
    wheelInk: '#ff3b30',
    hub: 'radial-gradient(circle at 40% 35%, #ff4b40 0%, #ff0000 55%, #a00000 100%)',
    hubInk: '#fff',
  },
  spotify: {
    brand: 'Spotify',
    model: 'GREEN·BEAT',
    body: 'linear-gradient(160deg, #2d2d2d 0%, #191414 50%, #050505 100%)',
    bodyEdge: '#000',
    bodyInk: '#1ed760',
    screenBg: 'radial-gradient(120% 90% at 50% 0%, #0b2414 0%, #020a05 72%)',
    lcdInk: '#c9ffd9',
    lcdDim: 'rgba(160, 255, 190, 0.42)',
    lcdGlow: 'rgba(30, 215, 96, 0.8)',
    vis: ['#1db954', '#1ed760', '#b8ffcf'],
    peak: '#ffffff',
    wheel: 'radial-gradient(circle at 35% 30%, #3b3b3b 0%, #222 60%, #111 100%)',
    wheelInk: '#1ed760',
    hub: 'radial-gradient(circle at 40% 35%, #4be38a 0%, #1db954 55%, #0d7a33 100%)',
    hubInk: '#062b13',
  },
  soundcloud: {
    brand: 'SoundCloud',
    model: 'CLOUD·MP3',
    body: 'linear-gradient(160deg, #ff8a3d 0%, #ff5500 45%, #c23d00 100%)',
    bodyEdge: '#8a2b00',
    bodyInk: '#fff',
    screenBg: 'radial-gradient(120% 90% at 50% 0%, #2b1305 0%, #110601 72%)',
    lcdInk: '#ffe6d1',
    lcdDim: 'rgba(255, 210, 175, 0.45)',
    lcdGlow: 'rgba(255, 120, 30, 0.75)',
    vis: ['#ff5500', '#ff9a3d', '#ffe08a'],
    peak: '#ffffff',
    wheel: 'radial-gradient(circle at 35% 30%, #fff 0%, #f2f2f2 55%, #d2d2d2 100%)',
    wheelInk: '#e04b00',
    hub: 'radial-gradient(circle at 40% 35%, #ff8a3d 0%, #ff5500 60%, #b33a00 100%)',
    hubInk: '#fff',
  },
  generic: {
    brand: 'CensaiAudio',
    model: 'MP3·256MB',
    body: 'linear-gradient(160deg, #f4f6f8 0%, #c9ced6 40%, #8e959f 100%)',
    bodyEdge: '#6b727c',
    bodyInk: '#2b3340',
    screenBg: 'radial-gradient(120% 90% at 50% 0%, #0f2c3d 0%, #04121b 72%)',
    lcdInk: '#c7f1ff',
    lcdDim: 'rgba(170, 225, 255, 0.45)',
    lcdGlow: 'rgba(60, 190, 255, 0.75)',
    vis: ['#2bb3ff', '#5ef0ff', '#d6fbff'],
    peak: '#ffffff',
    wheel: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e6e9ed 55%, #b9bfc8 100%)',
    wheelInk: '#3b4656',
    hub: 'radial-gradient(circle at 40% 35%, #f9fafb 0%, #d5dae1 60%, #9aa2ad 100%)',
    hubInk: '#2b3340',
  },
};

export function skinFor(source) {
  return MUSIC_SKINS[source] || MUSIC_SKINS.generic;
}

export const VISUALIZER_MODES = ['bars', 'scope', 'ambience'];

export const VISUALIZER_LABELS = {
  bars: 'BARS & WAVES',
  scope: 'SCOPE',
  ambience: 'AMBIENCE',
};

export function nextVisualizerMode(mode) {
  const i = VISUALIZER_MODES.indexOf(mode);
  return VISUALIZER_MODES[(i + 1) % VISUALIZER_MODES.length];
}

export function formatTime(seconds) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

// Stable 32-bit hash so each track gets its own tempo and spectrum shape.
export function seedFromString(value) {
  let h = 2166136261;
  const str = String(value || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
