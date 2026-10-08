/**
 * src/lib/theme/themeFile.js
 *
 * Theme export / import: a small JSON file someone can share and someone else
 * can load (the seed of a theme marketplace). Import is a whitelist — only
 * known fields survive, numbers are clamped, and custom CSS values that could
 * fetch or inject anything (url(), @import, braces, semicolons) are dropped.
 */

import { CUSTOM_MOOD_ID, DEFAULT_CUSTOM_COLORS, SHAPE_KEYS, normalizeShape } from './looks.js';

export const THEME_FILE_FORMAT = 'homebase-theme';
export const THEME_FILE_VERSION = 1;
const MAX_CUSTOM_VARS = 64;
const SAFE_VAR_NAME = /^--[a-z0-9-]{1,48}$/i;
const UNSAFE_VALUE = /url\(|@import|expression\(|javascript:|[;{}<>\\]/i;

const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export function exportThemeFile(theme, name = 'My theme') {
  const shape = normalizeShape(theme);
  return {
    format: THEME_FILE_FORMAT,
    version: THEME_FILE_VERSION,
    name: String(name).slice(0, 80),
    colors: {
      mood: theme.mood,
      hue: theme.hue,
      chroma: theme.chroma,
      lightness: theme.lightness,
      ...(theme.mood === CUSTOM_MOOD_ID ? { customColors: { ...DEFAULT_CUSTOM_COLORS, ...(theme.customColors || {}) } } : {}),
      customVars: { ...(theme.customVars || {}) },
    },
    shape: Object.fromEntries(SHAPE_KEYS.map((k) => [k, shape[k]])),
  };
}

export function serializeThemeFile(theme, name) {
  return JSON.stringify(exportThemeFile(theme, name), null, 2);
}

/**
 * Parse a theme file (string or object) into a theme patch.
 * @param {string|object} input
 * @param {Record<string, unknown>} knownMoods  mood ids that exist locally
 * @returns {{ ok: true, name: string, patch: object } | { ok: false, error: string }}
 */
export function parseThemeFile(input, knownMoods = {}) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > 64 * 1024) return { ok: false, error: 'Theme file is too large.' };
    try { data = JSON.parse(input); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  }
  if (!data || typeof data !== 'object' || data.format !== THEME_FILE_FORMAT) {
    return { ok: false, error: 'That is not a Homebase theme file.' };
  }
  if (Number(data.version) > THEME_FILE_VERSION) {
    return { ok: false, error: 'This theme was made by a newer Homebase.' };
  }
  const colors = data.colors && typeof data.colors === 'object' ? data.colors : {};
  const mood = colors.mood === CUSTOM_MOOD_ID || Object.prototype.hasOwnProperty.call(knownMoods, colors.mood)
    ? colors.mood
    : null;
  if (!mood) return { ok: false, error: 'This theme uses a colorway this Homebase does not have.' };

  const customVars = {};
  for (const [k, v] of Object.entries(colors.customVars || {}).slice(0, MAX_CUSTOM_VARS)) {
    if (SAFE_VAR_NAME.test(k) && typeof v === 'string' && v.length <= 200 && !UNSAFE_VALUE.test(v)) customVars[k] = v;
  }
  const patch = {
    look: mood === CUSTOM_MOOD_ID ? 'custom' : null,
    mood,
    hue: num(colors.hue, 0, 360, 265),
    chroma: num(colors.chroma, 0, 0.4, 0.13),
    lightness: num(colors.lightness, 0, 1, 0.68),
    customVars,
    ...normalizeShape(data.shape || {}),
  };
  if (mood === CUSTOM_MOOD_ID) {
    const cc = colors.customColors || {};
    patch.customColors = {
      mode: cc.mode === 'light' ? 'light' : 'dark',
      baseHue: num(cc.baseHue, 0, 360, DEFAULT_CUSTOM_COLORS.baseHue),
      tint: num(cc.tint, 0, 0.04, DEFAULT_CUSTOM_COLORS.tint),
      accentHue: num(cc.accentHue, 0, 360, DEFAULT_CUSTOM_COLORS.accentHue),
    };
  }
  return { ok: true, name: String(data.name || 'Imported theme').slice(0, 80), patch };
}
