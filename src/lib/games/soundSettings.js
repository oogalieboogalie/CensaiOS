// Game sound on/off and volume (spec 11), remembered per person in this
// browser. Every game shares the one setting.

const KEY = 'homebase.games.sound.v1';
export const DEFAULT_SOUND = Object.freeze({ muted: false, volume: 0.6 });

export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SOUND.volume;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function loadSoundSettings(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_SOUND };
    return { muted: Boolean(raw.muted), volume: clampVolume(raw.volume ?? DEFAULT_SOUND.volume) };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveSoundSettings(settings, storage = globalThis.localStorage) {
  const clean = { muted: Boolean(settings?.muted), volume: clampVolume(settings?.volume) };
  try { storage?.setItem(KEY, JSON.stringify(clean)); } catch { /* private window: keep it for this visit */ }
  return clean;
}
