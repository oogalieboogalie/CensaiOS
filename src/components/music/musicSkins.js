// Device skins for the retro MP3-player Music window. Each source gets the
// plastic, screen and wheel colors of a branded player: YouTube red, YouTube
// Music black-and-red, Spotify black-and-green, SoundCloud orange, a walnut
// and amber tuner for internet radio, and a silver USB stick player for
// local files, song links and anything else, plus a hand-picked desktop
// player skin (skinChoice.js). Colors are
// flat on purpose: depth comes from bevel shadows in src/styles/music.css,
// not gradients.
import { directAudioKind } from './linkAudio.js';
import { musicHostKind } from './musicHosts.js';

export const MUSIC_SOURCES = ['youtube', 'ytmusic', 'spotify', 'soundcloud', 'radio', 'local', 'generic'];

export function detectMusicSource(url) {
  const raw = String(url || '').toLowerCase();
  if (!raw) return 'generic';
  const service = musicHostKind(url);
  if (service) return service;
  if (directAudioKind(url) === 'radio') return 'radio';
  return 'generic';
}

export const SOURCE_TAGS = { youtube: 'YT', ytmusic: 'YTM', spotify: 'SPOT', soundcloud: 'SC', radio: 'FM', local: 'USB', generic: 'MP3' };

export const MUSIC_SKINS = {
  youtube: {
    brand: 'YouTube',
    model: 'TUBE·PLAYER',
    body: '#e62117',
    bodyEdge: '#8f0c05',
    bodyInk: '#ffffff',
    screenBg: '#170403',
    lcdInk: '#ffd9d4',
    lcdDim: 'rgba(255, 190, 180, 0.42)',
    lcdGlow: 'rgba(255, 80, 60, 0.7)',
    vis: ['#ff2a1a', '#ff8a3d', '#ffe66b'],
    peak: '#ffffff',
    wheel: '#f3f3f3',
    wheelInk: '#c4120a',
    hub: '#e62117',
    hubInk: '#ffffff',
  },
  ytmusic: {
    brand: 'YouTube Music',
    model: 'YTM·POD',
    body: '#1a1a1a',
    bodyEdge: '#000000',
    bodyInk: '#ffffff',
    screenBg: '#0b0202',
    lcdInk: '#ffe1de',
    lcdDim: 'rgba(255, 200, 195, 0.4)',
    lcdGlow: 'rgba(255, 0, 0, 0.65)',
    vis: ['#ff0000', '#ff4e45', '#ffb3ad'],
    peak: '#ffffff',
    wheel: '#2a2a2a',
    wheelInk: '#ff3b30',
    hub: '#ff0000',
    hubInk: '#ffffff',
  },
  spotify: {
    brand: 'Spotify',
    model: 'GREEN·BEAT',
    body: '#191414',
    bodyEdge: '#000000',
    bodyInk: '#1ed760',
    screenBg: '#04110a',
    lcdInk: '#c9ffd9',
    lcdDim: 'rgba(160, 255, 190, 0.4)',
    lcdGlow: 'rgba(30, 215, 96, 0.75)',
    vis: ['#1db954', '#1ed760', '#b8ffcf'],
    peak: '#ffffff',
    wheel: '#262626',
    wheelInk: '#1ed760',
    hub: '#1db954',
    hubInk: '#062b13',
  },
  soundcloud: {
    brand: 'SoundCloud',
    model: 'CLOUD·MP3',
    body: '#ff5500',
    bodyEdge: '#a33600',
    bodyInk: '#ffffff',
    screenBg: '#170802',
    lcdInk: '#ffe6d1',
    lcdDim: 'rgba(255, 210, 175, 0.42)',
    lcdGlow: 'rgba(255, 120, 30, 0.7)',
    vis: ['#ff5500', '#ff9a3d', '#ffe08a'],
    peak: '#ffffff',
    wheel: '#f3f3f3',
    wheelInk: '#e04b00',
    hub: '#ff5500',
    hubInk: '#ffffff',
  },
  radio: {
    brand: 'CensaiRadio',
    model: 'NET·TUNER',
    body: '#4a3222',
    bodyEdge: '#24170e',
    bodyInk: '#f4dca8',
    screenBg: '#140b02',
    lcdInk: '#ffd27a',
    lcdDim: 'rgba(255, 210, 122, 0.42)',
    lcdGlow: 'rgba(255, 170, 40, 0.72)',
    vis: ['#ff9f1c', '#ffc94d', '#fff1c2'],
    peak: '#ffffff',
    wheel: '#d9c7a3',
    wheelInk: '#4a3222',
    hub: '#e8a33a',
    hubInk: '#2a1a0c',
  },
  generic: {
    brand: 'CensaiAudio',
    model: 'USB·MP3 1GB',
    body: '#d4d8de',
    bodyEdge: '#8a919b',
    bodyInk: '#2b3340',
    screenBg: '#06151f',
    lcdInk: '#c7f1ff',
    lcdDim: 'rgba(170, 225, 255, 0.42)',
    lcdGlow: 'rgba(60, 190, 255, 0.7)',
    vis: ['#2bb3ff', '#5ef0ff', '#d6fbff'],
    peak: '#ffffff',
    wheel: '#eef0f3',
    wheelInk: '#3b4656',
    hub: '#c3c9d1',
    hubInk: '#2b3340',
  },
};

// Picked by hand only (never by source): an early-2000s desktop player in
// dark brushed metal with green glowing digits and a small equalizer strip.
MUSIC_SKINS.desktop = {
  brand: 'CensaiAmp',
  model: 'DESKTOP·2001',
  body: '#2b3034',
  bodyEdge: '#101315',
  bodyInk: '#b8c2c9',
  screenBg: '#020b04',
  lcdInk: '#3dff6e',
  lcdDim: 'rgba(61, 255, 110, 0.4)',
  lcdGlow: 'rgba(61, 255, 110, 0.75)',
  vis: ['#1fcf4f', '#3dff6e', '#d4ff4a'],
  peak: '#ffffff',
  wheel: '#3b4146',
  wheelInk: '#3dff6e',
  hub: '#4a5157',
  hubInk: '#3dff6e',
  eq: true,
};

MUSIC_SKINS.local = MUSIC_SKINS.generic;

/** The skin as CSS custom properties, read by src/styles/music.css. */
export function skinVars(skin) {
  return {
    '--mp-body': skin.body,
    '--mp-edge': skin.bodyEdge,
    '--mp-ink': skin.bodyInk,
    '--mp-screen': skin.screenBg,
    '--mp-lcd': skin.lcdInk,
    '--mp-lcd-dim': skin.lcdDim,
    '--mp-glow': skin.lcdGlow,
    '--mp-vis-0': skin.vis[0],
    '--mp-vis-1': skin.vis[1],
    '--mp-vis-2': skin.vis[2],
    '--mp-wheel': skin.wheel,
    '--mp-wheel-ink': skin.wheelInk,
    '--mp-hub': skin.hub,
    '--mp-hub-ink': skin.hubInk,
  };
}

export function skinFor(source) {
  return MUSIC_SKINS[source] || MUSIC_SKINS.generic;
}

export const VISUALIZER_MODES = ['bars', 'scope', 'vu', 'ambience', 'swirl'];

export const VISUALIZER_LABELS = {
  bars: 'BARS & WAVES',
  scope: 'SCOPE',
  vu: 'VU METERS',
  ambience: 'AMBIENCE',
  swirl: 'SWIRL',
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
