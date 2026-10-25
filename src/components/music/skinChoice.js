import { MUSIC_SKINS } from './musicSkins.js';
import { logMusic } from './linkAudio.js';

// The skin each person picked for a Music window, remembered in their own
// browser. Auto (the default) keeps following the source.

const KEY = 'homebase.music.skin.v1';

export const SKIN_CHOICES = [
  { id: 'auto', label: 'Auto' },
  { id: 'desktop', label: 'Desktop 2001' },
  { id: 'generic', label: 'USB silver' },
  { id: 'youtube', label: 'YouTube red' },
  { id: 'ytmusic', label: 'YouTube Music' },
  { id: 'spotify', label: 'Spotify green' },
  { id: 'soundcloud', label: 'SoundCloud orange' },
  { id: 'radio', label: 'Walnut radio' },
];

const known = (id) => SKIN_CHOICES.some((c) => c.id === id);

function readAll(storage) {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

export function loadSkinChoice(winId, storage = globalThis.localStorage) {
  const id = readAll(storage)[winId];
  return known(id) ? id : 'auto';
}

export function saveSkinChoice(winId, id, storage = globalThis.localStorage) {
  if (!winId || !known(id)) return;
  const all = readAll(storage);
  if (id === 'auto') delete all[winId]; else all[winId] = id;
  try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* private window: keep it for this visit */ }
  logMusic('info', `picked the ${SKIN_CHOICES.find((c) => c.id === id).label} skin`);
}

/** The picked skin, or null for Auto. */
export function chosenSkin(id) {
  return id && id !== 'auto' ? MUSIC_SKINS[id] || null : null;
}
