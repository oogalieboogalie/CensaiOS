import { DEFAULT_SCRIPT } from './defaultScript.js';

// Settings one Teleprompter window shares with its pop-out. The pop-out is a
// separate page (same site), so the two talk through localStorage: every
// change is written here and the other page hears it as a "storage" event.
export const PROMPTER_KEY = 'censai.teleprompter.v1';

export const SPEED_MIN = 1;
export const SPEED_MAX = 10;
export const SIZE_MIN = 20;
export const SIZE_MAX = 96;

export const DEFAULTS = Object.freeze({ text: DEFAULT_SCRIPT, speed: 4, size: 40, mirror: false });

const clamp = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback);

/** Fills gaps and keeps every number in range, whatever was saved. */
export function normalizePrompter(raw = {}) {
  return {
    text: typeof raw.text === 'string' ? raw.text : DEFAULTS.text,
    speed: clamp(raw.speed, SPEED_MIN, SPEED_MAX, DEFAULTS.speed),
    size: clamp(raw.size, SIZE_MIN, SIZE_MAX, DEFAULTS.size),
    mirror: Boolean(raw.mirror),
  };
}

/** Speed level 1-10 as pixels per second, scaled to the text size so a step feels the same at any size. */
export function pixelsPerSecond(speed, size) {
  return Math.round(speed * size * 0.22);
}

/** About how long the whole script takes to say, at a calm 150 words a minute. */
export function readingTime(text = '') {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const seconds = Math.round((words / 150) * 60);
  return { words, seconds, label: seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec` };
}

export function readShared(storage = globalThis.localStorage) {
  try {
    return normalizePrompter(JSON.parse(storage?.getItem(PROMPTER_KEY) || '{}'));
  } catch {
    return normalizePrompter();
  }
}

export function writeShared(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PROMPTER_KEY, JSON.stringify(normalizePrompter(state)));
  } catch {
    // Private mode or full storage: the pop-out just keeps what it has.
  }
}
